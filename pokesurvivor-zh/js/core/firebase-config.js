/* ============ firebase-config.js — conexión con tu proyecto de Firebase ============
 * Pega aquí la configuración de tu app web de Firebase (Consola de Firebase >
 * Configuración del proyecto > Tus apps > SDK setup and configuration > Config).
 * Los pasos completos están en docs/FIREBASE.md.
 *
 * Estos datos NO son secretos: Firebase los diseña para ir en la web. Lo que
 * protege las partidas son las reglas de Firestore (firestore.rules).
 *
 * Si se pone a null, el juego funciona en modo local (sólo en el navegador).
 */
// Proyecto pokesurvivor-free (desde el 12-10-2026): autenticación normal de Firebase,
// SIN Identity Platform, así las cuentas son gratis sin límite. ¡No pulsar nunca
// "Actualizar a Identity Platform" en su consola! (El viejo era pokesurvivor-jpter.)
G.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB1LpJcsnT7gj7c8cpRMGjhswLPr8-dnBw',
  authDomain: 'pokesurvivor-free.firebaseapp.com',
  projectId: 'pokesurvivor-free',
  storageBucket: 'pokesurvivor-free.firebasestorage.app',
  messagingSenderId: '798271504277',
  appId: '1:798271504277:web:dcac4409f969239e87009c',
  databaseURL: 'https://pokesurvivor-free-default-rtdb.europe-west1.firebasedatabase.app'
};

/* Ejemplo de cómo debe quedar:
// 中文版：預設單機模式（進度只存在瀏覽器），不連線到原作者的 Firebase 專案。
// 要啟用登入／合作／排行榜，請改成「你自己的」Firebase 專案設定（見 docs/FIREBASE.md）。
G.FIREBASE_CONFIG = null;
*/
