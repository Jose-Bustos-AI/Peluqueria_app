(function() {
  'use strict';
  
  // Configuración para desarrollo con URL de Lovable
  const defaultConfig = {
    backgroundColor: 'rgba(37, 44, 88, 1)',
    primaryColor: '#ef4444',
    textColor: '#ffffff',
    width: '384px',
    height: '100vh',
    borderRadius: '0px',
    position: 'fixed',
    right: '20px',
    top: '20px',
    zIndex: 9999,
    shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    companyName: 'Centro Pleno',
    companyAddress: 'C/Navegante Juan Fernández, 14, Murcia',
    companyHours: '09:00 - 21:00',
    // URL actual de desarrollo en Lovable
    bookingUrl: 'https://b2a4688a-8a38-40fa-a0a9-3c29506c6b49.sandbox.lovable.dev/widget',
    showCloseButton: true,
    autoOpen: false,
    triggerSelector: null
  };

  // Función para mergear configuración
  function mergeConfig(userConfig) {
    return Object.assign({}, defaultConfig, userConfig || {});
  }

  // Función para crear el iframe del widget
  function createWidgetIframe(config) {
    const iframe = document.createElement('iframe');
    iframe.id = 'pleno-widget-iframe';
    iframe.src = config.bookingUrl;
    iframe.style.cssText = `
      width: ${config.width};
      height: ${config.height};
      border: none;
      border-radius: ${config.borderRadius};
      box-shadow: ${config.shadow};
      position: ${config.position};
      right: ${config.right};
      top: ${config.top};
      z-index: ${config.zIndex};
      background: ${config.backgroundColor};
      transition: all 0.3s ease;
      display: none;
    `;
    
    return iframe;
  }

  // Función para crear el botón flotante
  function createFloatingButton(config) {
    const button = document.createElement('button');
    button.id = 'pleno-widget-button';
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <span style="margin-left: 8px;">Reservar</span>
    `;
    
    button.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      background: ${config.primaryColor};
      color: ${config.textColor};
      border: none;
      border-radius: 50px;
      padding: 12px 20px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: ${config.shadow};
      z-index: ${config.zIndex + 1};
      display: flex;
      align-items: center;
      transition: all 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Efectos hover
    button.onmouseover = function() {
      this.style.transform = 'scale(1.05)';
      this.style.boxShadow = '0 8px 25px -8px rgba(0, 0, 0, 0.3)';
    };
    
    button.onmouseout = function() {
      this.style.transform = 'scale(1)';
      this.style.boxShadow = config.shadow;
    };

    return button;
  }

  // Función para crear el botón de cerrar
  function createCloseButton(config) {
    const closeButton = document.createElement('button');
    closeButton.id = 'pleno-widget-close';
    closeButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.5);
      color: white;
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      cursor: pointer;
      z-index: ${config.zIndex + 2};
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;

    closeButton.onmouseover = function() {
      this.style.background = 'rgba(0, 0, 0, 0.7)';
    };
    
    closeButton.onmouseout = function() {
      this.style.background = 'rgba(0, 0, 0, 0.5)';
    };

    return closeButton;
  }

  // Función principal para inicializar el widget
  function initPlenoWidget(userConfig) {
    const config = mergeConfig(userConfig);
    
    // Evitar múltiples inicializaciones
    if (document.getElementById('pleno-widget-iframe')) {
      console.warn('Pleno Widget ya está inicializado');
      return;
    }

    // Crear elementos
    const iframe = createWidgetIframe(config);
    const floatingButton = createFloatingButton(config);
    let closeButton = null;
    
    if (config.showCloseButton) {
      closeButton = createCloseButton(config);
    }

    // Estado del widget
    let isOpen = config.autoOpen;

    // Función para mostrar/ocultar widget
    function toggleWidget() {
      if (isOpen) {
        iframe.style.display = 'none';
        if (closeButton) closeButton.style.display = 'none';
        floatingButton.style.display = 'flex';
        isOpen = false;
      } else {
        iframe.style.display = 'block';
        if (closeButton) closeButton.style.display = 'flex';
        floatingButton.style.display = 'none';
        isOpen = true;
      }
    }

    // Event listeners
    floatingButton.addEventListener('click', toggleWidget);
    if (closeButton) {
      closeButton.addEventListener('click', toggleWidget);
    }

    // Agregar elementos al DOM
    document.body.appendChild(iframe);
    document.body.appendChild(floatingButton);
    if (closeButton) {
      document.body.appendChild(closeButton);
    }

    // Si hay un selector trigger personalizado
    if (config.triggerSelector) {
      const triggers = document.querySelectorAll(config.triggerSelector);
      triggers.forEach(trigger => {
        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          if (!isOpen) toggleWidget();
        });
      });
    }

    // Estado inicial
    if (config.autoOpen) {
      toggleWidget();
    }

    // Responsive handling
    function handleResize() {
      if (window.innerWidth < 480) {
        iframe.style.width = '100vw';
        iframe.style.height = '100vh';
        iframe.style.right = '0';
        iframe.style.top = '0';
        iframe.style.borderRadius = '0';
      } else {
        iframe.style.width = config.width;
        iframe.style.height = config.height;
        iframe.style.right = config.right;
        iframe.style.top = config.top;
        iframe.style.borderRadius = config.borderRadius;
      }
    }

    window.addEventListener('resize', handleResize);
    handleResize(); // Llamar al cargar

    // API pública
    window.PlenoWidget = {
      open: function() {
        if (!isOpen) toggleWidget();
      },
      close: function() {
        if (isOpen) toggleWidget();
      },
      toggle: toggleWidget,
      isOpen: function() {
        return isOpen;
      },
      destroy: function() {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (floatingButton.parentNode) floatingButton.parentNode.removeChild(floatingButton);
        if (closeButton && closeButton.parentNode) closeButton.parentNode.removeChild(closeButton);
        window.removeEventListener('resize', handleResize);
        delete window.PlenoWidget;
      }
    };

    console.log('Pleno Widget inicializado correctamente');
    return window.PlenoWidget;
  }

  // Auto-inicialización si hay configuración global
  if (window.plenoWidgetConfig) {
    document.addEventListener('DOMContentLoaded', function() {
      initPlenoWidget(window.plenoWidgetConfig);
    });
  }

  // Exportar función de inicialización
  window.initPlenoWidget = initPlenoWidget;

})();