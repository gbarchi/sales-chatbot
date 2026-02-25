import duckdb from 'duckdb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getHolidaysForRange } from './holidayService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DataService {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.metadataCache = null;  // Cache metadata since it's static after server start
  }

  async initialize() {
    if (this.initialized) return;

    await new Promise((resolve, reject) => {
      // Create in-memory database
      this.db = new duckdb.Database(':memory:');
      this.conn = this.db.connect();

      // Support both Docker and local development paths
      const csvPath = process.env.CSV_PATH || path.resolve(__dirname, '../../../MAVIJU_DASHBOARD_VENTAS_ANL_VTA_2 0.csv');

      console.log('Loading CSV data into DuckDB...');
      console.log('CSV Path:', csvPath);

      // Create table from CSV with cleaned columns
      // Removed: RazonSocial, Slpcode, Color, StockPrice, PriceBefDi, ValDesc, DocTotal,
      //          ProvinciaEnvio, CiudadEnvio, Name, Impuesto
      const createTableSQL = `
        CREATE TABLE sales AS
        SELECT
          strptime(SPLIT_PART(Fecha, ',', 1), '%Y-%m-%d %H:%M:%S')::DATE as Fecha,
          NumSem::INTEGER as NumSem,
          CardCode,
          Cardname,
          Categoria_SN,
          SubCategoria_SN,
          Slpcode::INTEGER as Slpcode,
          NombreVendedor,
          NombreSupervisor,
          ItmsgrpName,
          SubFamiliaName,
          Categoria,
          SubCategoria,
          ItemCode,
          Dscription,
          Quantity::DOUBLE as Quantity,
          DiscPrcnt::DOUBLE as DiscPrcnt,
          Price::DOUBLE as Price,
          LineTotal::DOUBLE as LineTotal,
          LineCost::DOUBLE as LineCost,
          Margen::DOUBLE as Margen,
          DocNum,
          ProvinciaPrincipal,
          CiudadPrincipal,
          DocumentoTipo,
          Remate,
          MaviOferta,
          Feria,
          Web,
          DescGlobal::DOUBLE as DescGlobal
        FROM read_csv_auto('${csvPath.replace(/'/g, "''")}', header=true, ignore_errors=true);
      `;

      this.conn.run(createTableSQL, (err) => {
        if (err) {
          console.error('Error loading CSV:', err);
          reject(err);
          return;
        }

        // Create indexes for common queries
        const indexQueries = [
          'CREATE INDEX idx_fecha ON sales(Fecha)',
          'CREATE INDEX idx_vendedor ON sales(NombreVendedor)',
          'CREATE INDEX idx_supervisor ON sales(NombreSupervisor)',
          'CREATE INDEX idx_categoria ON sales(Categoria)',
          'CREATE INDEX idx_provincia ON sales(ProvinciaPrincipal)'
        ];

        let completed = 0;
        indexQueries.forEach(query => {
          this.conn.run(query, (err) => {
            if (err) console.warn('Index creation warning:', err.message);
            completed++;
            if (completed === indexQueries.length) {
              this.initialized = true;
              console.log('DuckDB initialized successfully!');
              resolve();
            }
          });
        });
      });
    });

    // Load optional clients CSV (for map queries)
    await this._loadClientsTable();
  }

  async _loadClientsTable() {
    // Look for clients.csv in the same directory as the sales CSV
    // This works regardless of whether the repo is nested or at root level
    const salesCsvPath = process.env.CSV_PATH || path.resolve(__dirname, '../../../MAVIJU_DASHBOARD_VENTAS_ANL_VTA_2 0.csv');
    const clientsCsvPath = process.env.CLIENTS_CSV_PATH ||
      path.join(path.dirname(salesCsvPath), 'clients.csv');

    if (!fs.existsSync(clientsCsvPath)) {
      console.log('[dataService] No clients.csv found — map queries will be unavailable');
      this.hasClients = false;
      return;
    }

    return new Promise((resolve) => {
      // Detect column format by peeking at the first row
      this.conn.all(
        `SELECT * FROM read_csv_auto('${clientsCsvPath.replace(/'/g, "''")}', header=true, ignore_errors=true) LIMIT 1`,
        (err, rows) => {
          if (err || !rows || rows.length === 0) {
            console.warn('[dataService] clients.csv could not be read:', err?.message);
            this.hasClients = false;
            return resolve();
          }

          const cols = Object.keys(rows[0]).map(c => c.toLowerCase());
          const hasLatLng = cols.includes('lat') && cols.includes('lng');
          const hasUbicacion = cols.includes('u_ubicacion');
          const cardcodeCol = cols.includes('cardcode') ? 'cardcode' : 'CardCode';
          const cardnameCol = cols.includes('cardname') ? 'cardname' : (cols.includes('nombre') ? 'nombre' : null);
          const ciudadCol   = cols.includes('ciudad') ? 'ciudad' : (cols.includes('city') ? 'city' : null);
          const provinciaCol = cols.includes('provincia') ? 'provincia' : null;
          const vendedorCol  = cols.includes('nombrevendedor') ? 'nombrevendedor' : null;
          const slpcodeCol    = cols.includes('slpcode')    ? 'SlpCode'    : null;
          const balanceCol    = cols.includes('balance')    ? 'Balance'    : null;
          const creditlineCol = cols.includes('creditline') ? 'creditline' : null;

          let latExpr, lngExpr;
          if (hasLatLng) {
            latExpr = 'TRY_CAST(Lat AS DOUBLE)';
            lngExpr = 'TRY_CAST(Lng AS DOUBLE)';
          } else if (hasUbicacion) {
            // Format: "-0.214234,-78.407998"
            latExpr = `TRY_CAST(TRIM(SPLIT_PART(REPLACE(u_ubicacion, '"', ''), ',', 1)) AS DOUBLE)`;
            lngExpr = `TRY_CAST(TRIM(SPLIT_PART(REPLACE(u_ubicacion, '"', ''), ',', 2)) AS DOUBLE)`;
          } else {
            console.warn('[dataService] clients.csv: no lat/lng or u_ubicacion column found');
            this.hasClients = false;
            return resolve();
          }

          const sql = `
            CREATE TABLE IF NOT EXISTS clients AS
            SELECT
              CAST(${cardcodeCol} AS VARCHAR)                    AS CardCode,
              ${cardnameCol ? `CAST(${cardnameCol} AS VARCHAR)` : "NULL::VARCHAR"} AS Cardname,
              ${latExpr}                                          AS Lat,
              ${lngExpr}                                          AS Lng,
              ${ciudadCol   ? `CAST(${ciudadCol}    AS VARCHAR)` : "NULL::VARCHAR"} AS Ciudad,
              ${provinciaCol ? `CAST(${provinciaCol} AS VARCHAR)` : "NULL::VARCHAR"} AS Provincia,
              ${vendedorCol  ? `CAST(${vendedorCol}  AS VARCHAR)` : "NULL::VARCHAR"} AS NombreVendedor,
              ${slpcodeCol    ? `TRY_CAST(${slpcodeCol}    AS INTEGER)` : "NULL::INTEGER"} AS SlpCode,
              ${balanceCol    ? `TRY_CAST(${balanceCol}    AS DOUBLE)`  : "NULL::DOUBLE"}  AS Balance,
              ${creditlineCol ? `CASE WHEN TRY_CAST(${creditlineCol} AS DOUBLE) < 20 THEN 0 ELSE TRY_CAST(${creditlineCol} AS DOUBLE) END` : "NULL::DOUBLE"}  AS CreditLine
            FROM read_csv_auto('${clientsCsvPath.replace(/'/g, "''")}', header=true, ignore_errors=true)
            WHERE ${latExpr} IS NOT NULL AND ${lngExpr} IS NOT NULL
          `;

          this.conn.run(sql, (err2) => {
            if (err2) {
              console.warn('[dataService] clients.csv could not be loaded:', err2.message);
              this.hasClients = false;
            } else {
              console.log('Clients table loaded from CSV!');
              this.hasClients = true;
            }
            resolve();
          });
        }
      );
    });
  }

  async executeQuery(sql) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Basic SQL injection protection - only allow read queries
    const trimmedSQL = sql.trim().toUpperCase();

    // Allow SELECT and WITH (CTEs) queries
    const isSelectQuery = trimmedSQL.startsWith('SELECT');
    const isCTEQuery = trimmedSQL.startsWith('WITH') && trimmedSQL.includes('SELECT');

    if (!isSelectQuery && !isCTEQuery) {
      throw new Error('Only SELECT queries are allowed');
    }

    // Block dangerous keywords that modify data
    const blockedKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE'];
    for (const keyword of blockedKeywords) {
      // Check if keyword appears as a standalone word (not part of another word)
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(trimmedSQL)) {
        throw new Error(`Query contains blocked keyword: ${keyword}`);
      }
    }

    // Block SQL injection patterns
    if (trimmedSQL.includes('--') || trimmedSQL.includes(';--') || trimmedSQL.includes('/*')) {
      throw new Error('Query contains invalid characters');
    }

    return new Promise((resolve, reject) => {
      this.conn.all(sql, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  async getMetadata() {
    if (!this.initialized) {
      await this.initialize();
    }

    // Return cached metadata if available (data is static after server start)
    if (this.metadataCache) {
      return this.metadataCache;
    }

    const [
      vendedores,
      supervisores,
      categorias,
      provincias,
      grupos,
      subfamilias,
      subcategorias,
      ciudades,
      categoria_sn,
      subcategoria_sn,
      dateRange,
      rowCount
    ] = await Promise.all([
      this.executeQuery('SELECT DISTINCT NombreVendedor FROM sales WHERE NombreVendedor IS NOT NULL ORDER BY NombreVendedor'),
      this.executeQuery('SELECT DISTINCT NombreSupervisor FROM sales WHERE NombreSupervisor IS NOT NULL ORDER BY NombreSupervisor'),
      this.executeQuery('SELECT DISTINCT Categoria FROM sales WHERE Categoria IS NOT NULL ORDER BY Categoria'),
      this.executeQuery('SELECT DISTINCT ProvinciaPrincipal FROM sales WHERE ProvinciaPrincipal IS NOT NULL ORDER BY ProvinciaPrincipal'),
      this.executeQuery('SELECT DISTINCT ItmsgrpName FROM sales WHERE ItmsgrpName IS NOT NULL ORDER BY ItmsgrpName'),
      this.executeQuery('SELECT DISTINCT SubFamiliaName FROM sales WHERE SubFamiliaName IS NOT NULL ORDER BY SubFamiliaName'),
      this.executeQuery('SELECT DISTINCT SubCategoria FROM sales WHERE SubCategoria IS NOT NULL ORDER BY SubCategoria'),
      this.executeQuery('SELECT DISTINCT CiudadPrincipal FROM sales WHERE CiudadPrincipal IS NOT NULL ORDER BY CiudadPrincipal'),
      this.executeQuery('SELECT DISTINCT Categoria_SN FROM sales WHERE Categoria_SN IS NOT NULL ORDER BY Categoria_SN'),
      this.executeQuery('SELECT DISTINCT SubCategoria_SN FROM sales WHERE SubCategoria_SN IS NOT NULL ORDER BY SubCategoria_SN'),
      this.executeQuery('SELECT MIN(Fecha) as minDate, MAX(Fecha) as maxDate FROM sales'),
      this.executeQuery('SELECT CAST(COUNT(*) AS INTEGER) as count FROM sales')
    ]);

    // Fetch Ecuador holidays for the data range (cached after first call)
    const minDateStr = dateRange[0].minDate instanceof Date
      ? dateRange[0].minDate.toISOString().split('T')[0]
      : String(dateRange[0].minDate).split('T')[0];
    const maxDateStr = dateRange[0].maxDate instanceof Date
      ? dateRange[0].maxDate.toISOString().split('T')[0]
      : String(dateRange[0].maxDate).split('T')[0];
    const holidays = await getHolidaysForRange(minDateStr, maxDateStr);

    const metadata = {
      vendedores: vendedores.map(r => r.NombreVendedor),
      supervisores: supervisores.map(r => r.NombreSupervisor),
      categorias: categorias.map(r => r.Categoria),
      grupos: grupos.map(r => r.ItmsgrpName),
      subfamilias: subfamilias.map(r => r.SubFamiliaName),
      provincias: provincias.map(r => r.ProvinciaPrincipal),
      subcategorias: subcategorias.map(r => r.SubCategoria),
      ciudades: ciudades.map(r => r.CiudadPrincipal),
      categoria_sn: categoria_sn.map(r => r.Categoria_SN),
      subcategoria_sn: subcategoria_sn.map(r => r.SubCategoria_SN),
      dateRange: {
        min: dateRange[0].minDate,
        max: dateRange[0].maxDate
      },
      rowCount: rowCount[0].count,
      holidays,
      hasClients: this.hasClients || false,
      schema: {
        columns: [
          { name: 'Fecha', type: 'DATE', description: 'Fecha de la transacción' },
          { name: 'NumSem', type: 'INTEGER', description: 'Número de semana' },
          { name: 'CardCode', type: 'STRING', description: 'Código del cliente' },
          { name: 'Cardname', type: 'STRING', description: 'Nombre del cliente' },
          { name: 'Categoria_SN', type: 'STRING', description: 'Categoría del socio de negocio (Ferreterías, etc.)' },
          { name: 'SubCategoria_SN', type: 'STRING', description: 'Subcategoría del socio de negocio' },
          { name: 'Slpcode', type: 'INTEGER', description: 'Código único del vendedor' },
          { name: 'NombreVendedor', type: 'STRING', description: 'Nombre del vendedor' },
          { name: 'NombreSupervisor', type: 'STRING', description: 'Nombre del supervisor' },
          { name: 'ItmsgrpName', type: 'STRING', description: 'Familia del producto (nivel más alto de la jerarquía: Iluminación, Material Eléctrico, Herramientas, Materiales Construc, etc. - nota los acentos)' },
          { name: 'SubFamiliaName', type: 'STRING', description: 'Subfamilia/marca del producto (AQUA, etc.)' },
          { name: 'Categoria', type: 'STRING', description: 'Categoría del producto (INTERRUPTORES, CABLES, etc.)' },
          { name: 'SubCategoria', type: 'STRING', description: 'Subcategoría del producto' },
          { name: 'ItemCode', type: 'STRING', description: 'Código del artículo' },
          { name: 'Dscription', type: 'STRING', description: 'Descripción del artículo' },
          { name: 'Quantity', type: 'DOUBLE', description: 'Cantidad vendida' },
          { name: 'DiscPrcnt', type: 'DOUBLE', description: 'Porcentaje de descuento aplicado' },
          { name: 'Price', type: 'DOUBLE', description: 'Precio unitario final' },
          { name: 'LineTotal', type: 'DOUBLE', description: 'Total de la línea (venta)' },
          { name: 'LineCost', type: 'DOUBLE', description: 'Costo de la línea' },
          { name: 'Margen', type: 'DOUBLE', description: 'Margen de ganancia (%)' },
          { name: 'DocNum', type: 'STRING', description: 'Número de documento/factura' },
          { name: 'ProvinciaPrincipal', type: 'STRING', description: 'Provincia del cliente' },
          { name: 'CiudadPrincipal', type: 'STRING', description: 'Ciudad del cliente' },
          { name: 'DocumentoTipo', type: 'STRING', description: 'Tipo de documento (FAC=Factura, etc.)' },
          { name: 'Remate', type: 'STRING', description: 'Indicador de remate: Y=sí remate, N=no remate, NULL. Para filtrar remates: Remate = \'Y\'' },
          { name: 'MaviOferta', type: 'STRING', description: 'Tipo de oferta: N=sin oferta, MAVIOFERTAS, Promo Especial I, Promo Especial II. Para filtrar ofertas: MaviOferta != \'N\'' },
          { name: 'Feria', type: 'INTEGER', description: 'Canal de venta feria: 1=canal tradicional, 2=venta en feria. Para filtrar ferias: Feria = 2' },
          { name: 'Web', type: 'STRING', description: 'Canal web: NULL=canal tradicional, SanaStore=venta por web. Para filtrar web: Web IS NOT NULL' },
          { name: 'DescGlobal', type: 'DOUBLE', description: 'Descuento global aplicado' }
        ]
      }
    };

    // Cache the metadata (data is static after server start)
    this.metadataCache = metadata;
    return metadata;
  }

  // Get distinct vendedores who made sales in a specific year
  async getVendedoresByYear(year) {
    if (!this.initialized) {
      await this.initialize();
    }
    const safeYear = parseInt(year);
    const result = await this.executeQuery(
      `SELECT DISTINCT NombreVendedor FROM sales WHERE YEAR(Fecha) = ${safeYear} AND NombreVendedor IS NOT NULL ORDER BY NombreVendedor`
    );
    return result.map(r => r.NombreVendedor);
  }

  // Get vendors list with Slpcode for admin user management
  async getVendorsList() {
    if (!this.initialized) {
      await this.initialize();
    }
    const result = await this.executeQuery(`
      SELECT DISTINCT Slpcode, NombreVendedor, NombreSupervisor
      FROM sales
      WHERE NombreVendedor IS NOT NULL AND Slpcode IS NOT NULL
      ORDER BY NombreVendedor
    `);
    return result;
  }

  // Get supervisors list for admin user management
  async getSupervisorsList() {
    if (!this.initialized) {
      await this.initialize();
    }
    const result = await this.executeQuery(`
      SELECT DISTINCT NombreSupervisor
      FROM sales
      WHERE NombreSupervisor IS NOT NULL
      ORDER BY NombreSupervisor
    `);
    return result.map(r => r.NombreSupervisor);
  }
}

export const dataService = new DataService();
export default dataService;
