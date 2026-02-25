import React, { useState } from 'react';
import ChartContainer from './ChartContainer';

const renderInline = (text) => {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={idx}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))   return <em key={idx}>{part.slice(1, -1)}</em>;
    return part;
  });
};

const renderMarkdownLine = (text) => {
  if (text.startsWith('## ')) return <strong style={{ display: 'block', marginTop: 4 }}>{renderInline(text.slice(3))}</strong>;
  if (text.startsWith('# '))  return <strong style={{ display: 'block', marginTop: 4 }}>{renderInline(text.slice(2))}</strong>;
  return renderInline(text);
};

function ChartCarousel({ results, onDrillDown }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSQL, setShowSQL] = useState(false);

  if (!results || results.length === 0) {
    return null;
  }

  const goToPrevious = () => {
    setShowSQL(false);
    setCurrentIndex((prev) => (prev === 0 ? results.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setShowSQL(false);
    setCurrentIndex((prev) => (prev === results.length - 1 ? 0 : prev + 1));
  };

  const currentResult = results[currentIndex];

  return (
    <div className="chart-carousel">
      {/* Navigation Header */}
      <div className="carousel-header">
        <div className="carousel-dots">
          {results.map((_, index) => (
            <button
              key={index}
              className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(index)}
              title={`Resultado ${index + 1}`}
            />
          ))}
        </div>
        <div className="carousel-counter">
          {currentIndex + 1} / {results.length}
        </div>
        <div className="carousel-arrows">
          <button
            className="carousel-arrow prev"
            onClick={goToPrevious}
            title="Anterior"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="carousel-arrow next"
            onClick={goToNext}
            title="Siguiente"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Current Chart */}
      <div className="carousel-content">
        {currentResult.error ? (
          <div className="carousel-error">
            <p>{currentResult.message}</p>
          </div>
        ) : (
          <ChartContainer
            data={currentResult.data}
            chartType={currentResult.chartType}
            chartConfig={currentResult.chartConfig}
            onDrillDown={onDrillDown}
          />
        )}
      </div>

      {/* Explanation */}
      {currentResult.explanation && (
        <div className="carousel-explanation">
          {currentResult.explanation}
        </div>
      )}

      {/* Analysis for current result */}
      {currentResult.analysis && (
        <div className="carousel-analysis">
          <div className="analysis-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" fill="currentColor"/>
            </svg>
            Análisis e Insights
          </div>
          <div className="analysis-content">
            {currentResult.analysis.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {renderMarkdownLine(line)}
                {i < currentResult.analysis.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* SQL toggle for current result */}
      {currentResult.sql && (
        <div className="sql-section">
          <button className="sql-toggle" onClick={() => setShowSQL(!showSQL)}>
            {showSQL ? '▼' : '▶'} Ver SQL
          </button>
          {showSQL && <pre className="sql-code">{currentResult.sql}</pre>}
        </div>
      )}

      <style>{`
        .chart-carousel {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .carousel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .carousel-dots {
          display: flex;
          gap: 8px;
        }

        .carousel-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: none;
          background: #d1d5db;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 0;
        }

        .carousel-dot:hover {
          background: #9ca3af;
        }

        .carousel-dot.active {
          background: var(--primary-color);
          transform: scale(1.2);
        }

        .carousel-counter {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .carousel-arrows {
          display: flex;
          gap: 4px;
        }

        .carousel-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: white;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .carousel-arrow:hover {
          border-color: var(--primary-color);
          color: var(--primary-color);
          background: #f8faff;
        }

        .carousel-content {
          min-height: 300px;
        }

        .carousel-error {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          background: #fef2f2;
          border-radius: 8px;
          color: #dc2626;
          padding: 20px;
        }

        .carousel-explanation {
          font-size: 13px;
          color: var(--text-secondary);
          padding: 8px 12px;
          background: #f0fdf4;
          border-radius: 6px;
          border-left: 3px solid #22c55e;
        }

        .carousel-analysis {
          padding: 14px 16px;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-radius: 12px;
          border-left: 4px solid #f59e0b;
        }

        .carousel-analysis .analysis-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 13px;
          color: #92400e;
          margin-bottom: 10px;
        }

        .carousel-analysis .analysis-header svg {
          color: #f59e0b;
        }

        .carousel-analysis .analysis-content {
          font-size: 13px;
          line-height: 1.6;
          color: #78350f;
        }

        @media (max-width: 768px) {
          .carousel-header {
            flex-wrap: wrap;
            gap: 8px;
          }

          .carousel-dots {
            order: 2;
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default ChartCarousel;
