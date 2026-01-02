const fs = require('fs');

/**
 * Load SSL certificates for HTTPS server
 * @returns {Object} SSL credentials object with key, cert, and ca
 */
const loadSSLCertificates = () => {
  try {
    const privateKey = fs.readFileSync('d:/Coding/DungeonsAndDragons/Certs/dungeonlair.ddns.net-key.pem', 'utf8');
    const certificate = fs.readFileSync('d:/Coding/DungeonsAndDragons/Certs/dungeonlair.ddns.net-crt.pem', 'utf8');
    const ca = fs.readFileSync('d:/Coding/DungeonsAndDragons/Certs/dungeonlair.ddns.net-chain-only.pem', 'utf8');
    
    return { key: privateKey, cert: certificate, ca: ca };
  } catch (error) {
    console.error('Error loading SSL certificates:', error);
    throw error;
  }
};

module.exports = { loadSSLCertificates };
