// ============================================================
// GİRİŞ NOKTASI — index.html sadece bu dosyayı yüklüyor.
// Tüm oyun kodu js/ klasöründeki modüllerde; buraya kod EKLEME.
// ============================================================
import { S } from "./js/state.js";
import { startGame } from "./js/game-core.js";
import { showLoginScreen } from "./js/auth-ui.js";
import "./js/firebase-setup.js";
import "./js/core-config.js";
import "./js/items-data.js";
import "./js/item-systems.js";
import "./js/events-badges.js";
import "./js/quests.js";
import "./js/worldboss.js";
import "./js/map.js";
import "./js/admin.js";
import "./js/dom.js";
import "./js/tutorial-updates.js";
import "./js/inventory.js";
import "./js/auth-ui.js";
import "./js/game-core.js";
import "./js/wheel-bounty-oracle.js";
import "./js/box-open.js";
import "./js/market.js";
import "./js/battle.js";
import "./js/ui-misc.js";

// ============================================================
// BAŞLAT
// ============================================================
if (S.currentPlayerId) {
  startGame().catch(() => showLoginScreen());
} else {
  showLoginScreen();
}
