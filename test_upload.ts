import fs from 'fs';

async function test() {
  const fileData = fs.readFileSync('test.pdf');
  const formData = new FormData();
  formData.append('resume', new Blob([fileData]), 'test.pdf');
  
  const res = await fetch('http://localhost:3000/api/upload-resume', {
    method: 'POST',
    body: formData
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
