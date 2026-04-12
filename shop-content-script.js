/**
 * shop-content-script.js
 * Blocks the TIG purchase button in the 42 Shop if ANTI-TIG mode is enabled.
 */

(function () {
  const TIG_PRODUCT_ID = "1820";

  function applyProtection() {
    chrome.storage.local.get(["enableAntiTig"], (data) => {
      if (!data.enableAntiTig) return;

      // 1. Find the main shop button
      const shopButtons = document.querySelectorAll(`button[data-target="#buy-modal-${TIG_PRODUCT_ID}"]`);
      shopButtons.forEach(btn => {
        if (btn.dataset.antiTigProtected) return;
        
        btn.dataset.antiTigProtected = "true";
        btn.style.backgroundColor = "#e74c3c";
        btn.style.borderColor = "#e74c3c";
        btn.style.color = "#fff";
        btn.style.fontWeight = "900";
        btn.style.cursor = "default";
        btn.style.pointerEvents = "none";
        btn.innerHTML = "🛡️ PROTECTION ACTIVE";
        
        // Disable original modal attributes
        btn.removeAttribute("data-toggle");
        btn.removeAttribute("data-target");
      });

      // 2. Find and block the button inside the modal if it was already open
      const modal = document.querySelector(`#buy-modal-${TIG_PRODUCT_ID}`);
      if (modal) {
        const modalBuyBtn = modal.querySelector('button.btn-primary');
        if (modalBuyBtn && !modalBuyBtn.dataset.antiTigProtected) {
          modalBuyBtn.dataset.antiTigProtected = "true";
          modalBuyBtn.disabled = true;
          modalBuyBtn.textContent = "🛡️ ACHAT BLOQUÉ PAR L'EXTENSION";
          modalBuyBtn.style.opacity = "0.5";
          modalBuyBtn.style.cursor = "not-allowed";
          
          const helpBlock = modal.querySelector('.help-block');
          if (helpBlock) {
            helpBlock.innerHTML = "<b style='color:#e74c3c'>PROTECTION ANTI-TIG ACTIVÉE !</b><br>Désactivez le bouclier dans les options si vous tenez vraiment à faire des TIG...";
          }
        }
      }
    });
  }

  // Run immediately and then on a loop to handle React/Ajax loads
  applyProtection();
  setInterval(applyProtection, 2000);

  console.log("42 Logtime: Anti-TIG protection script loaded.");
})();
