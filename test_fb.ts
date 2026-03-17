import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    await setDoc(doc(db, 'jobs', 'test_123'), {
      url: 'http://example.com',
      srNumber: 'test_123',
      title: 'Test Job',
      anbieter: 'N/A',
      unserProfil: 'N/A',
      ihrProfil: 'N/A',
      ihreAufgaben: 'N/A',
      unserAngebot: 'N/A',
      uberUns: 'N/A',
      bewerbung: 'N/A',
      email: 'N/A'
    });
    console.log('Success!');
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
