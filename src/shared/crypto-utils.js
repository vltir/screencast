import sjcl from 'sjcl';

export function pad20(str) {
  const spaces = '____________________';
  return (str + spaces).slice(0, 20);
}

export function deriveTrackerRoomId(bip39String) {
  const normalized = bip39String.trim().toLowerCase();
  const bitArray = sjcl.hash.sha256.hash(normalized);
  const fullHex = sjcl.codec.hex.fromBits(bitArray);

  return pad20(fullHex);
}

export function encryptText(key, text) {
  return sjcl.encrypt(key, text);
}

export function decryptText(key, encryptedJson) {
  return sjcl.decrypt(key, encryptedJson);
}

export function optimizeSdp(sdpString) {
  return sdpString
    .split('\n')
    .filter(line => {
      if (line.startsWith('a=candidate:')) {
        const parts = line.split(' ');
        // Feld 4 im WebRTC-Standard-Kandidaten-String enthält die IP-Adresse.
        // Wenn diese einen Doppelpunkt enthält, ist es eine IPv6-Adresse -> weg damit!
        if (parts[4] && parts[4].indexOf(':') !== -1) {
          return false;
        }
      }
      return true;
    })
    .join('\n');
}