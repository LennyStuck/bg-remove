import React, { useState, useRef, useEffect } from 'react';
import { removeBackground as imglyRemoveBackground } from '@imgly/background-removal';
import { 
  Upload, 
  Download, 
  Trash2, 
  RefreshCw, 
  Image as ImageIcon, 
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Copy,
  Clipboard,
  Sliders,
  Scissors
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
  
  // Background styling
  const [bgType, setBgType] = useState('transparent'); // 'transparent', 'color', 'gradient' | 'custom'
  const [selectedBg, setSelectedBg] = useState('transparent');
  const [customColor, setCustomColor] = useState('#8b5cf6');

  // Edge refinement options (anti-halo)
  const [erosionAmount, setErosionAmount] = useState(1); // 0 to 3
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
      alert('Не удалось получить доступ к буферу. Нажмите Ctrl+V (или Cmd+V на Mac) в любом месте экрана.');
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
    }, 150); // Debounce to allow smooth slider dragging

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
                // Look in a 3x3 neighborhood
                for (let ky = -1; ky <= 1; ky++) {
                  for (let kx = -1; kx <= 1; kx++) {
                    const nIdx = ((y + ky) * width + (x + kx)) * 4;
                    if (copy[nIdx + 3] < minAlpha) {
                      minAlpha = copy[nIdx + 3];
                    }
                  }
                }
                // Smoothly erode alpha at borders
                data[idx + 3] = Math.round(data[idx + 3] * 0.2 + minAlpha * 0.8);
              }
            }
          }
        }

        // 2. High-brightness de-halo (darkens/fades light pixel halo at semi-transparent borders)
        if (dehalo) {
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            // Only refine boundary pixels
            if (a > 0 && a < 240) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              
              // If pixel is very bright/white (potential background bleeding)
              if (r > 170 && g > 170 && b > 170) {
                const brightness = (r + g + b) / 3;
                const factor = (brightness - 170) / (255 - 170); // 0 to 1
                // Erode border opacity for very light pixels
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
    setLoadingStep('Инициализация модели AI...');

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
      alert("Не удалось обработать изображение. Возможно, файл слишком большой или формат не поддерживается.");
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

        // 1. Draw Background
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

        // 2. Draw foreground cutout
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
    });
  };

  // Download composed image
  const downloadComposedImage = async () => {
    const canvas = await getComposedCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'cutout-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Copy composed image directly to Clipboard
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
        alert('Не удалось скопировать в буфер. Убедитесь, что у вашего браузера есть разрешение на запись в буфер обмена.');
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

  // CSS Style object for comparison slider background
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
    <div className="glass-panel" style={{ maxWidth: '1100px', width: '100%' }}>
      <header style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <Sparkles style={{ color: 'var(--primary)' }} /> Smart Cutout
        </h1>
        <p className="subtitle">Умное удаление фона и сглаживание краев прямо в вашем браузере</p>
      </header>

      {!originalImage ? (
        // Dropzone & Copy-Paste Area
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div 
            className={`dropzone ${dragActive ? 'active' : ''}`}
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
            <div className="dropzone-icon">
              <Upload size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Перетащите сюда картинку</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              или нажмите для выбора файла на диске
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px' }}>
              Поддерживаются PNG, JPG, JPEG, WEBP.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>или</span>
            <button className="btn btn-secondary" onClick={pasteFromClipboard} style={{ padding: '10px 16px', borderRadius: '10px' }}>
              <Clipboard size={16} style={{ marginRight: '6px' }} /> Вставить из буфера (Ctrl+V)
            </button>
          </div>
        </div>
      ) : (
        // Workspace Area
        <div>
          {isProcessing ? (
            // Processing Loader state
            <div className="loader-container">
              <div className="loader-spinner"></div>
              <h3 style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{loadingStep}</h3>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                При первом запуске скачивается легковесная AI-модель (около 70 МБ). Это происходит один раз.
              </p>
            </div>
          ) : (
            // Workspace Grid (Preview & Controls)
            <div className="workspace-grid">
              
              {/* Left Column: Image Preview with slider comparison */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="preview-container transparency-bg">
                  {cutoutImage ? (
                    <div 
                      ref={sliderRef}
                      className="split-slider-container"
                    >
                      {/* Original image */}
                      <img 
                        src={originalImage} 
                        className="split-image split-image-before" 
                        style={{
                          clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`
                        }}
                        alt="Original"
                      />
                      
                      {/* Processed/Refined cutout */}
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

                      {/* Slider handle bar */}
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
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Maximize2 size={14} /> Двигайте ползунок для сравнения "До / После"
                  </p>
                  <button className="btn btn-secondary" onClick={resetWorkspace}>
                    <Trash2 size={16} /> Сбросить
                  </button>
                </div>
              </div>

              {/* Right Column: Controls Panel */}
              <div className="sidebar-panel">
                
                {/* Control Group 1: Anti-Halo & Edge Refinement */}
                <div className="control-group">
                  <div className="control-title">
                    <Sliders size={16} style={{ color: 'var(--primary)' }} /> Устранение ареола краев
                  </div>
                  
                  {/* Erosion slider */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Сжатие краев (Erosion):</span>
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

                  {/* De-halo toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <input 
                      type="checkbox" 
                      checked={dehaloEnabled}
                      onChange={(e) => setDehaloEnabled(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    Ослаблять белый ареол (Luminance De-halo)
                  </label>
                </div>

                {/* Control Group 2: Background substitution */}
                <div className="control-group">
                  <div className="control-title">
                    <Layers size={16} style={{ color: 'var(--primary)' }} /> Замена фона
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <button 
                      className={`btn btn-secondary ${bgType === 'transparent' ? 'selected' : ''}`}
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem', border: bgType === 'transparent' ? '1px solid var(--primary)' : 'none' }}
                      onClick={() => { setBgType('transparent'); setSelectedBg('transparent'); }}
                    >
                      Прозрачный
                    </button>
                    <button 
                      className={`btn btn-secondary ${bgType === 'color' ? 'selected' : ''}`}
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem', border: bgType === 'color' ? '1px solid var(--primary)' : 'none' }}
                      onClick={() => { setBgType('color'); setSelectedBg('#ffffff'); }}
                    >
                      Цвет
                    </button>
                    <button 
                      className={`btn btn-secondary ${bgType === 'gradient' ? 'selected' : ''}`}
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem', border: bgType === 'gradient' ? '1px solid var(--primary)' : 'none' }}
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
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Кастомный цвет:
                      </p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: customColor, border: '1px solid var(--border-glass)' }}></div>
                        <span style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>{customColor}</span>
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
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Изображение будет скопировано/скачано как PNG с прозрачным фоном.
                    </p>
                  )}
                </div>

                {/* Control Group 3: Actions */}
                <div className="control-group" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button 
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '16px' }}
                    onClick={downloadComposedImage}
                  >
                    <Download size={18} /> Скачать результат
                  </button>

                  <button 
                    className="btn btn-secondary"
                    style={{ width: '100%', color: 'var(--primary)' }}
                    onClick={copyComposedImage}
                  >
                    <Copy size={16} /> Скопировать в буфер
                  </button>
                  
                  <button 
                    className="btn btn-secondary"
                    style={{ width: '100%' }}
                    onClick={() => removeBackground(originalImage)}
                  >
                    <RefreshCw size={14} /> Переобработать
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

      <footer style={{ marginTop: '40px', borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Нейросеть выполняется на технологии WebAssembly / ONNX Runtime. Скорость зависит от вашего устройства.
        </p>
      </footer>
    </div>
  );
}
