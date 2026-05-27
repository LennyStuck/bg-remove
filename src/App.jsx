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
  Zap,
  Crop
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
  
  // Background style
  const [bgType, setBgType] = useState('transparent');
  const [selectedBg, setSelectedBg] = useState('transparent');
  const [customColor, setCustomColor] = useState('#a3e635');

  // Edge & layout refinement options
  const [erosionAmount, setErosionAmount] = useState(1);
  const [dehaloEnabled, setDehaloEnabled] = useState(true);
  const [autoCropEnabled, setAutoCropEnabled] = useState(true); // Autotrim transparency bounding box
  const [copySuccess, setCopySuccess] = useState(false); // Clipboard visual feedback

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

  // Button clipboard paste
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

  // Edge Refinement + Auto-crop Processing logic
  useEffect(() => {
    if (!rawCutoutUrl) return;

    let active = true;
    setIsRefining(true);

    const timer = setTimeout(async () => {
      let refinedUrl = await applyEdgeRefinement(rawCutoutUrl, erosionAmount, dehaloEnabled);
      
      // Auto-crop to content bounds
      if (autoCropEnabled) {
        refinedUrl = await applyAutoCrop(refinedUrl);
      }
      
      if (active) {
        setCutoutImage(refinedUrl);
        setIsRefining(false);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [rawCutoutUrl, erosionAmount, dehaloEnabled, autoCropEnabled]);

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

  // Transparency bounding-box auto-crop (autotrim)
  const applyAutoCrop = (imgSrc) => {
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

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const width = canvas.width;
        const height = canvas.height;

        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        let hasContent = false;

        // Find bounds of non-transparent pixels
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 8) { // Strict alpha threshold
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              hasContent = true;
            }
          }
        }

        // If completely blank, return original
        if (!hasContent) {
          resolve(imgSrc);
          return;
        }

        // Add 12px comfort safety padding, clamped to bounds
        const padding = 12;
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropWidth = Math.min(width - cropX, (maxX - minX) + padding * 2);
        const cropHeight = Math.min(height - cropY, (maxY - minY) + padding * 2);

        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = cropWidth;
        trimmedCanvas.height = cropHeight;
        const trimmedCtx = trimmedCanvas.getContext('2d');

        trimmedCtx.drawImage(
          canvas,
          cropX, cropY, cropWidth, cropHeight, // Source bounds
          0, 0, cropWidth, cropHeight          // Destination bounds
        );

        resolve(trimmedCanvas.toDataURL('image/png'));
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
    link.download = 'cutout-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Direct Clipboard Copy with interactive button state feedback (Zero browser popups!)
  const copyComposedImage = async () => {
    const canvas = await getComposedCanvas();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error(err);
        alert('Не удалось скопировать в буфер. Предоставьте разрешение в браузере.');
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
    setCopySuccess(false);
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

      {/* 1. Navbar */}
      <nav className="landing-navbar">
        <div className="brand-logo">
          <Sparkles size={20} style={{ color: 'var(--primary)', fill: 'rgba(163, 230, 53, 0.1)' }} />
          <span>Smart Cutout</span>
          <span className="brand-badge">AI v2.0</span>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <a href="https://github.com/LennyStuck/bg-remove" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-high)', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: '500' }}>
            <Sparkles size={16} /> GitHub Repo
          </a>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <header className="hero-wrapper">
        <span className="hero-tag">
          <Cpu size={14} /> LOCAL-FIRST NEURAL SEGMENTATION
        </span>
        <h1 className="hero-title">
          Безупречное удаление фона. <span>В один клик.</span>
        </h1>
        <p className="hero-desc">
          Профессиональная сегментация краев, мгновенное копирование в буфер и продвинутое сжатие светлых ареолов. Полностью конфиденциально и прямо в вашем браузере.
        </p>
      </header>

      {/* 3. Obsidian Work Panel */}
      <main className="obsidian-card">
        {!originalImage ? (
          // Empty State
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
                <Upload size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-pure)', fontFamily: 'var(--font-display)', marginBottom: '4px' }}>
                  Перетащите изображение сюда
                </h3>
                <p style={{ color: 'var(--text-body)', fontSize: '0.9rem' }}>
                  или нажмите для выбора на компьютере
                </p>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', borderTop: '1px solid var(--border-subtle)', width: '100%', maxWidth: '280px', paddingTop: '12px' }}>
                PNG, JPG, WEBP • Локальная обработка
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>или просто скопируйте картинку и</span>
              <button className="btn btn-secondary" onClick={pasteFromClipboard} style={{ borderRadius: '10px' }}>
                <Clipboard size={16} /> Вставьте из буфера (Ctrl+V)
              </button>
            </div>
          </div>
        ) : (
          // Active Workspace State
          <div>
            {isProcessing ? (
              // Progress Loading
              <div className="loader-container">
                <div className="loader-spinner"></div>
                <h3 style={{ fontWeight: '600', color: 'var(--text-pure)', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                  {loadingStep}
                </h3>
                <div className="progress-bar-bg" style={{ maxWidth: '440px' }}>
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', textAlign: 'center', maxWidth: '360px' }}>
                  При первом запуске скачивается нейросеть (около 70 МБ). Все последующие обработки будут происходить моментально!
                </p>
              </div>
            ) : (
              // Split Slider Preview & Configurations Panel
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

                        {/* Slider bar */}
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
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-body)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Maximize2 size={12} style={{ color: 'var(--primary)' }} /> Двигайте шторку в центре для сравнения результата
                    </p>
                    <button className="btn btn-secondary" onClick={resetWorkspace} style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '10px' }}>
                      <Trash2 size={12} /> Сбросить
                    </button>
                  </div>
                </div>

                {/* Configurations Panel */}
                <div className="sidebar-panel">
                  
                  {/* Anti-Halo & Auto-crop */}
                  <div className="control-box-obsidian">
                    <div className="control-title" style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: 'var(--text-pure)' }}>
                      <Sliders size={16} style={{ color: 'var(--primary)' }} /> Тонкая настройка краев
                    </div>
                    
                    {/* Erosion range */}
                    <div style={{ marginBottom: '16px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--text-body)' }}>Сжатие контура:</span>
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

                    {/* De-halo checkbox */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-body)', marginBottom: '12px' }}>
                      <input 
                        type="checkbox" 
                        checked={dehaloEnabled}
                        onChange={(e) => setDehaloEnabled(e.target.checked)}
                        style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                      />
                      Ослаблять белый ареол
                    </label>

                    {/* Auto-crop transparent bounds checkbox */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-body)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                      <input 
                        type="checkbox" 
                        checked={autoCropEnabled}
                        onChange={(e) => setAutoCropEnabled(e.target.checked)}
                        style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                      />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Crop size={12} style={{ color: 'var(--primary)' }} /> Обрезать холст под объект
                      </span>
                    </label>
                  </div>

                  {/* Background Selector */}
                  <div className="control-box-obsidian">
                    <div className="control-title" style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: 'var(--text-pure)' }}>
                      <Layers size={16} style={{ color: 'var(--primary)' }} /> Замена подложки
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', marginTop: '12px' }}>
                      <button 
                        className={`btn btn-secondary ${bgType === 'transparent' ? 'selected' : ''}`}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.75rem', border: bgType === 'transparent' ? '1px solid var(--primary)' : 'none', borderRadius: '8px' }}
                        onClick={() => { setBgType('transparent'); setSelectedBg('transparent'); }}
                      >
                        Прозрачный
                      </button>
                      <button 
                        className={`btn btn-secondary ${bgType === 'color' ? 'selected' : ''}`}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.75rem', border: bgType === 'color' ? '1px solid var(--primary)' : 'none', borderRadius: '8px' }}
                        onClick={() => { setBgType('color'); setSelectedBg('#ffffff'); }}
                      >
                        Цвет
                      </button>
                      <button 
                        className={`btn btn-secondary ${bgType === 'gradient' ? 'selected' : ''}`}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.75rem', border: bgType === 'gradient' ? '1px solid var(--primary)' : 'none', borderRadius: '8px' }}
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
                          <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: customColor, border: '1px solid var(--border-glass)' }}></div>
                          <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{customColor}</span>
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
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-body)' }}>
                        Будет скопировано или скачано в формате PNG с сохранением прозрачности.
                      </p>
                    )}
                  </div>

                  {/* Actions CTA */}
                  <div className="control-box-obsidian" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button 
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '14px', borderRadius: '10px' }}
                      onClick={downloadComposedImage}
                    >
                      <Download size={16} /> Скачать изображение
                    </button>

                    <button 
                      className="btn btn-secondary"
                      style={{ 
                        width: '100%', 
                        color: copySuccess ? '#a3e635' : 'var(--text-pure)', 
                        borderColor: copySuccess ? '#a3e635' : 'rgba(255, 255, 255, 0.04)' 
                      }}
                      onClick={copyComposedImage}
                    >
                      <Copy size={14} /> {copySuccess ? 'Успешно скопировано! ✓' : 'Скопировать в буфер'}
                    </button>
                    
                    <button 
                      className="btn btn-secondary"
                      style={{ width: '100%' }}
                      onClick={() => removeBackground(originalImage)}
                    >
                      <RefreshCw size={12} /> Переобработать
                    </button>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. Editorial Features Grid */}
      <section className="features-grid">
        <div className="feature-box">
          <div className="feature-icon-badge">
            <Cpu size={18} />
          </div>
          <h4 className="feature-title">Neural Engine Local</h4>
          <p className="feature-text">
            Инференс нейросети происходит локально через WebAssembly. Исходные файлы остаются конфиденциальными и никогда не передаются на сервер.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-badge">
            <Sparkles size={18} />
          </div>
          <h4 className="feature-title">Anti-Halo Matting</h4>
          <p className="feature-text">
            Встроенные пиксельные фильтры математической эрозии альфа-канала и светимости эффективно устраняют белые и яркие контуры старого фона.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-badge">
            <Zap size={18} />
          </div>
          <h4 className="feature-title">Clipboard Integration</h4>
          <p className="feature-text">
            Полная интеграция с буфером обмена. Копируйте скриншот, вставляйте кнопкой (Ctrl+V) и забирайте готовый cutout в один клик.
          </p>
        </div>
      </section>

      {/* 5. Footer */}
      <footer className="landing-footer">
        <div>
          <span style={{ color: 'var(--text-pure)', fontWeight: '700', fontFamily: 'var(--font-display)' }}>Smart Cutout</span>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '6px' }}>© 2026. Crafted for professional designers.</p>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          WebGL & WebGPU Accelerated • ONNX Engine v1.7.0
        </div>
      </footer>
    </>
  );
}
