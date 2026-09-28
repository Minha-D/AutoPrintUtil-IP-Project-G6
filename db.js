const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      // Seed a couple of test student IDs — replace with your real class roster
      students: [
        { id: '0222510005101083', name: 'Minhazul Hassan' },
        { id: '0222510005101090', name: 'Istiak Isti' },
        { id: '0222510005101211', name: 'Tahozid Bin Shahadat'}
      ],
      documents: [],
      printLog: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };