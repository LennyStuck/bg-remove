import React, { useState, useRef, useEffect } from 'react';
import { removeBackground as imglyRemoveBackground } from '@imgly/background-removal';
import { 
  Upload, 
  Download, 
  Trash2, 
  RefreshCw, 
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Copy,
  Clipboard,
  Sliders,
  Cpu,
  Shield,
  Zap
} from 'lucide-react';

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #12c2e9 0%, #c471ed 50%, #f64f59 100%)',
  'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
];

const SOLID_COLORS = [
  'transparent',
  '#ffffff',
  '#000000',
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ec4899'
];

export default function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [rawCutoutUrl, setRawCutoutUrl] = useState(null);
  const [cutoutImage, setCutoutImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);
  
  // Background substitution
  const [bgType, setBgType] = useState('transparent');
  const [selectedBg, setSelectedBg] = useState('transparent');
  const [customColor, setCustomColor] = useState('#9d5cff');

  // Edge anti-halo settings
  const [erosionAmount, setErosionAmount] = useState(1);
  const [dehaloEnabled, setDehaloEnabled] = useState(true);

  const fileInputRef = useRef(null);
  const sliderRef = useRef(null);
  const isDraggingSlider = useRef(false);

  // Global Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Button-triggered clipboard paste
  const pasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            processFile(blob);
            return;
          }
        }
      }
      alert('В буфере обмена нет изображения. Скопируйте изображение и попробуйте снова.');
    } catch (err) {
      console.error(err);
      alert('Не удалось получить доступ к буферу. Нажмите Ctrl+V в любом месте экрана.');
    }
  };

  // Edge Refinement Processing logic
  useEffect(() => {
    if (!rawCutoutUrl) return;

    let active = true;
    setIsRefining(true);

    const timer = setTimeout(async () => {
      const refinedUrl = await applyEdgeRefinement(rawCutoutUrl, erosionAmount, dehaloEnabled);
      if (active) {
        setCutoutImage(refinedUrl);
        setIsRefining(false);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [rawCutoutUrl, erosionAmount, dehaloEnabled]);

  // Grayscale erosion + luminance-based de-haloing filter
  const applyEdgeRefinement = (imgSrc, erosion, dehalo) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = imgSrc;
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        if (erosion === 0 && !dehalo) {
          resolve(imgSrc);
          return;
        }

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const width = canvas.width;
        const height = canvas.height;

        // 1. Grayscale alpha channel erosion
        if (erosion > 0) {
          for (let pass = 0; pass < erosion; pass++) {
            const copy = new Uint8ClampedArray(data);
            for (let y = 1; y < height - 1; y++) {
              for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                if (copy[idx + 3] === 0) continue;

                let minAlpha = 255;
                for (let ky = -1; ky <= 1; ky++) {
                  for (let kx = -1; kx <= 1; kx++) {
                    const nIdx = ((y + ky) * width + (x + kx)) * 4;
                    if (copy[nIdx + 3] < minAlpha) {
                      minAlpha = copy[nIdx + 3];
                    }
                  }
                }
                data[idx + 3] = Math.round(data[idx + 3] * 0.2 + minAlpha * 0.8);
              }
            }
          }
        }

        // 2. High-brightness de-halo
        if (dehalo) {
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a > 0 && a < 240) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              
              if (r > 170 && g > 170 && b > 170) {
                const brightness = (r + g + b) / 3;
                const factor = (brightness - 170) / (255 - 170);
                data[i + 3] = Math.max(0, Math.round(a * (1 - factor * 0.6)));
              }
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
    });
  };

  // Setup event listeners for slider dragging
  const handleSliderMove = (clientX) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleTouchMove = (e) => {
    if (!isDraggingSlider.current) return;
    handleSliderMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDraggingSlider.current) return;
    handleSliderMove(e.clientX);
  };

  const handleMouseUp = () => {
    isDraggingSlider.current = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', handleMouseUp);
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    isDraggingSlider.current = true;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);
  };

  // Drag and drop events
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (fileOrBlob) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setOriginalImage(e.target.result);
      removeBackground(e.target.result);
    };
    reader.readAsDataURL(fileOrBlob);
  };

  const removeBackground = async (imageSrc) => {
    setIsProcessing(true);
    setRawCutoutUrl(null);
    setCutoutImage(null);
    setProgress(0);
    setLoadingStep('Инициализация AI...');

    try {
      const resultBlob = await imglyRemoveBackground(imageSrc, {
        progress: (key, current, total) => {
          const percent = Math.round((current / total) * 100);
          setProgress(percent);
          if (key.includes('fetch')) {
            setLoadingStep(`Загрузка AI ресурсов: ${percent}%`);
          } else if (key.includes('compute')) {
            setLoadingStep(`Анализ объекта и удаление фона: ${percent}%`);
          } else {
            setLoadingStep(`Обработка изображения...`);
          }
        }
      });

      const url = URL.createObjectURL(resultBlob);
      setRawCutoutUrl(url);
    } catch (error) {
      console.error("Error removing background:", error);
      alert("Не удалось обработать изображение.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to compose image onto background canvas
  const getComposedCanvas = () => {
    return new Promise((resolve) => {
      if (!cutoutImage) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.src = cutoutImage;
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');

        if (bgType === 'color' && selectedBg !== 'transparent') {
          ctx.fillStyle = selectedBg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (bgType === 'gradient') {
          const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          const colorMatches = selectedBg.match(/#[0-9a-fA-F]{6}/g);
          if (colorMatches && colorMatches.length >= 2) {
            gradient.addColorStop(0, colorMatches[0]);
            gradient.addColorStop(1, colorMatches[1]);
          } else {
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
          }
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (bgType === 'custom') {
          ctx.fillStyle = customColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
    });
  };

  const downloadComposedImage = async () => {
    const canvas = await getComposedCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'no-bg-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const copyComposedImage = async () => {
    const canvas = await getComposedCanvas();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        alert('Изображение скопировано в буфер обмена!');
      } catch (err) {
        console.error(err);
        alert('Не удалось скопировать. Предоставьте разрешение на буфер обмена.');
      }
    }, 'image/png');
  };

  const resetWorkspace = () => {
    setOriginalImage(null);
    setRawCutoutUrl(null);
    setCutoutImage(null);
    setIsProcessing(false);
    setProgress(0);
    setBgType('transparent');
    setSelectedBg('transparent');
    setErosionAmount(1);
    setDehaloEnabled(true);
  };

  const getComposedBgStyle = () => {
    if (bgType === 'transparent') {
      return {};
    } else if (bgType === 'color') {
      return { backgroundColor: selectedBg, backgroundImage: 'none' };
    } else if (bgType === 'gradient') {
      return { backgroundImage: selectedBg };
    } else if (bgType === 'custom') {
      return { backgroundColor: customColor, backgroundImage: 'none' };
    }
    return {};
  };

  return (
    <>
      {/* Decorative Blur Blobs */}
      <div className="glow-blob glow-1"></div>
      <div className="glow-blob glow-2"></div>
      <div className="glow-blob glow-3"></div>

      {/* 1. Sleek Navigation */}
      <nav className="landing-navbar">
        <div className="brand-logo">
          <Sparkles style={{ color: 'var(--primary)', fill: 'rgba(157, 92, 255, 0.2)' }} />
          <span>Smart Cutout</span>
          <span className="brand-badge">AI v2.0</span>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <a href="https://github.com/LennyStuck/bg-remove" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-high)', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: '500' }}>
            <Sparkles size={16} /> GitHub Repo
          </a>
        </div>
      </nav>

      {/* 2. Stunning Hero Banner */}
      <header className="hero-wrapper">
        <span className="hero-tag">
          <Cpu size={14} style={{ color: '#c084fc' }} /> LOCAL-FIRST NEURAL SEGMENTATION
        </span>
        <h1 className="hero-title">
          Безупречное удаление фона. <span>В один клик.</span>
        </h1>
        <p className="hero-desc">
          Профессиональная сегментация краев, мгновенное копирование в буфер и продвинутое сжатие светлых ареолов. Полностью конфиденциально и прямо в вашем браузере.
        </p>
      </header>

      {/* 3. Core App Card - Obsidian Panel */}
      <main className="obsidian-card">
        {!originalImage ? (
          // Landing/Dropzone State
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div 
              className="dropzone-obsidian"
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileChange}
                accept="image/*"
              />
              <div className="dropzone-icon-glow">
                <Upload size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-pure)', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>
                  Перетащите изображение сюда
                </h3>
                <p style={{ color: 'var(--text-body)', fontSize: '0.95rem' }}>
                  или нажмите для выбора на компьютере
                </p>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', borderTop: '1px solid var(--border-subtle)', width: '100%', maxWidth: '300px', paddingTop: '16px' }}>
                PNG, JPG, WEBP • Локальная обработка
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>или просто скопируйте картинку и</span>
              <button className="btn btn-secondary" onClick={pasteFromClipboard} style={{ borderRadius: '12px' }}>
                <Clipboard size={16} /> Вставьте из буфера (Ctrl+V)
              </button>
            </div>
          </div>
        ) : (
          // Active Workspace State
          <div>
            {isProcessing ? (
              // AI Loading Bar
              <div className="loader-container">
                <div className="loader-spinner"></div>
                <h3 style={{ fontWeight: '600', color: 'var(--text-pure)', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                  {loadingStep}
                </h3>
                <div className="progress-bar-bg" style={{ maxWidth: '480px' }}>
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', textAlign: 'center', maxWidth: '380px' }}>
                  Первый запуск инициализирует нейросеть (около 70 МБ). Все последующие обработки будут происходить моментально!
                </p>
              </div>
            ) : (
              // Active Split Screen Preview & Panel Grid
              <div className="workspace-grid">
                
                {/* Visual Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="preview-container-obsidian transparency-bg">
                    {cutoutImage ? (
                      <div 
                        ref={sliderRef}
                        className="split-slider-container"
                      >
                        {/* Original Image */}
                        <img 
                          src={originalImage} 
                          className="split-image split-image-before" 
                          style={{
                            clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`
                          }}
                          alt="Original"
                        />
                        
                        {/* Cutout Image */}
                        <img 
                          src={cutoutImage} 
                          className="split-image split-image-after"
                          style={{ 
                            clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)`,
                            ...getComposedBgStyle(),
                            opacity: isRefining ? 0.7 : 1,
                            transition: 'opacity 0.2s ease'
                          }} 
                          alt="Cutout"
                        />

                        {/* Split Bar */}
                        <div 
                          className="slider-bar" 
                          style={{ left: `${sliderPosition}%` }}
                          onMouseDown={handleMouseDown}
                          onTouchStart={handleMouseDown}
                        >
                          <div className="slider-handle">
                            <ChevronLeft size={14} />
                            <ChevronRight size={14} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img src={originalImage} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} alt="Preview" />
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-body)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Maximize2 size={14} style={{ color: 'var(--primary)' }} /> Тяните шторку в центре для сравнения результата
                    </p>
                    <button className="btn btn-secondary" onClick={resetWorkspace} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '10px' }}>
                      <Trash2 size={14} /> Сбросить проект
                    </button>
                  </div>
                </div>

                {/* Configurations Panel */}
                <div className="sidebar-panel">
                  
                  {/* Anti-Halo Panel */}
                  <div className="control-box-obsidian">
                    <div className="control-title" style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: 'var(--text-pure)' }}>
                      <Sliders size={16} style={{ color: 'var(--primary)' }} /> Устранение светлого ареола
                    </div>
                    
                    {/* Erosion Range */}
                    <div style={{ marginBottom: '16px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--text-body)' }}>Сжатие краев:</span>
                        <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{erosionAmount} px</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="3" 
                        value={erosionAmount} 
                        onChange={(e) => setErosionAmount(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                    </div>

                    {/* Luminance Dehalo Toggle */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-body)' }}>
                      <input 
                        type="checkbox" 
                        checked={dehaloEnabled}
                        onChange={(e) => setDehaloEnabled(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      Ослаблять белый ареол на стыках
                    </label>
                  </div>

                  {/* Custom Background Sub */}
                  <div className="control-box-obsidian">
                    <div className="control-title" style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: 'var(--text-pure)' }}>
                      <Layers size={16} style={{ color: 'var(--primary)' }} /> Замена подложки
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', marginTop: '12px' }}>
                      <button 
                        className={`btn btn-secondary ${bgType === 'transparent' ? 'selected' : ''}`}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', border: bgType === 'transparent' ? '1px solid var(--primary)' : 'none', borderRadius: '10px' }}
                        onClick={() => { setBgType('transparent'); setSelectedBg('transparent'); }}
                      >
                        Прозрачный
                      </button>
                      <button 
                        className={`btn btn-secondary ${bgType === 'color' ? 'selected' : ''}`}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', border: bgType === 'color' ? '1px solid var(--primary)' : 'none', borderRadius: '10px' }}
                        onClick={() => { setBgType('color'); setSelectedBg('#ffffff'); }}
                      >
                        Цвет
                      </button>
                      <button 
                        className={`btn btn-secondary ${bgType === 'gradient' ? 'selected' : ''}`}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', border: bgType === 'gradient' ? '1px solid var(--primary)' : 'none', borderRadius: '10px' }}
                        onClick={() => { setBgType('gradient'); setSelectedBg(GRADIENTS[0]); }}
                      >
                        Градиент
                      </button>
                    </div>

                    {bgType === 'color' && (
                      <div className="bg-options-grid">
                        {SOLID_COLORS.slice(1).map((color) => (
                          <button
                            key={color}
                            className={`bg-option-btn ${selectedBg === color ? 'selected' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setSelectedBg(color)}
                          ></button>
                        ))}
                        <input 
                          type="color" 
                          value={customColor} 
                          className="custom-color-picker" 
                          style={{ gridColumn: 'span 4' }}
                          onChange={(e) => {
                            setBgType('custom');
                            setCustomColor(e.target.value);
                          }}
                        />
                      </div>
                    )}

                    {bgType === 'gradient' && (
                      <div className="bg-options-grid">
                        {GRADIENTS.map((grad, i) => (
                          <button
                            key={i}
                            className={`bg-option-btn ${selectedBg === grad ? 'selected' : ''}`}
                            style={{ background: grad }}
                            onClick={() => setSelectedBg(grad)}
                          ></button>
                        ))}
                      </div>
                    )}

                    {bgType === 'custom' && (
                      <div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: customColor, border: '1px solid var(--border-glass)' }}></div>
                          <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{customColor}</span>
                        </div>
                        <input 
                          type="color" 
                          value={customColor} 
                          className="custom-color-picker" 
                          onChange={(e) => setCustomColor(e.target.value)}
                        />
                      </div>
                    )}
                    
                    {bgType === 'transparent' && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-body)' }}>
                        Будет скопировано или скачано в формате PNG с сохранением прозрачности.
                      </p>
                    )}
                  </div>

                  {/* CTA Buttons */}
                  <div className="control-box-obsidian" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button 
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '16px', borderRadius: '12px' }}
                      onClick={downloadComposedImage}
                    >
                      <Download size={18} /> Скачать изображение
                    </button>

                    <button 
                      className="btn btn-secondary"
                      style={{ width: '100%', color: 'var(--primary-hover)', borderColor: 'rgba(157, 92, 255, 0.2)' }}
                      onClick={copyComposedImage}
                    >
                      <Copy size={16} /> Скопировать в буфер
                    </button>
                    
                    <button 
                      className="btn btn-secondary"
                      style={{ width: '100%' }}
                      onClick={() => removeBackground(originalImage)}
                    >
                      <RefreshCw size={14} /> Переобработать заново
                    </button>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. Beautiful Editorial Feature Deck (Framer-style grid) */}
      <section className="features-grid">
        <div className="feature-box">
          <div className="feature-icon-badge">
            <Cpu size={20} />
          </div>
          <h4 className="feature-title">Neural Engine Local</h4>
          <p className="feature-text">
            Инференс нейросети происходит локально через WebAssembly. Исходные файлы остаются конфиденциальными и никогда не передаются на сервер.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-badge">
            <Sparkles size={20} />
          </div>
          <h4 className="feature-title">Anti-Halo Matting</h4>
          <p className="feature-text">
            Встроенные пиксельные фильтры математической эрозии альфа-канала и светимости эффективно устраняют белые и яркие контуры старого фона.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-badge">
            <Zap size={20} />
          </div>
          <h4 className="feature-title">Clipboard Integration</h4>
          <p className="feature-text">
            Полная интеграция с буфером обмена. Копируйте скриншот, вставляйте кнопкой (Ctrl+V) и забирайте готовый cutout в один клик.
          </p>
        </div>
      </section>

      {/* 5. Minimalist Design Footer */}
      <footer className="landing-footer">
        <div>
          <span style={{ color: 'var(--text-pure)', fontWeight: '700', fontFamily: 'var(--font-display)' }}>Smart Cutout</span>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>© 2026. Crafted for professional designers.</p>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          WebGL & WebGPU Accelerated • ONNX Engine v1.7.0
        </div>
      </footer>
    </>
  );
}
