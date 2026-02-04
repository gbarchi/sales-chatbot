import duckdb from 'duckdb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DataService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
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

    const [
      vendedores,
      supervisores,
      categorias,
      provincias,
      dateRange,
      rowCount
    ] = await Promise.all([
      this.executeQuery('SELECT DISTINCT NombreVendedor FROM sales WHERE NombreVendedor IS NOT NULL ORDER BY NombreVendedor'),
      this.executeQuery('SELECT DISTINCT NombreSupervisor FROM sales WHERE NombreSupervisor IS NOT NULL ORDER BY NombreSupervisor'),
      this.executeQuery('SELECT DISTINCT Categoria FROM sales WHERE Categoria IS NOT NULL ORDER BY Categoria'),
      this.executeQuery('SELECT DISTINCT ProvinciaPrincipal FROM sales WHERE ProvinciaPrincipal IS NOT NULL ORDER BY ProvinciaPrincipal'),
      this.executeQuery('SELECT MIN(Fecha) as minDate, MAX(Fecha) as maxDate FROM sales'),
      this.executeQuery('SELECT CAST(COUNT(*) AS INTEGER) as count FROM sales')
    ]);

    return {
      vendedores: vendedores.map(r => r.NombreVendedor),
      supervisores: supervisores.map(r => r.NombreSupervisor),
      categorias: categorias.map(r => r.Categoria),
      provincias: provincias.map(r => r.ProvinciaPrincipal),
      dateRange: {
        min: dateRange[0].minDate,
        max: dateRange[0].maxDate
      },
      rowCount: rowCount[0].count,
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
          { name: 'ItmsgrpName', type: 'STRING', description: 'Grupo de artículos (Material Eléctrico, etc.)' },
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
          { name: 'Remate', type: 'STRING', description: 'Indicador de remate (Y/N)' },
          { name: 'MaviOferta', type: 'STRING', description: 'Tipo de oferta Mavi (MAVIOFERTAS, Promo Especial, N)' },
          { name: 'Feria', type: 'STRING', description: 'Indicador de feria' },
          { name: 'Web', type: 'STRING', description: 'Canal web' },
          { name: 'DescGlobal', type: 'DOUBLE', description: 'Descuento global aplicado' }
        ]
      }
    };
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
