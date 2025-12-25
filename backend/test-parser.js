const fs = require('fs');
const pdfParse = require('pdf-parse');

async function test() {
    const dataBuffer = fs.readFileSync('uploads/documents/1766418852477-ziguix-CAU HOI ON TAP IoT.pdf');
    const data = await pdfParse(dataBuffer);

    const rawText = data.text;
    const fullText = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l).join(' ');

    // Better regex - look for A./B./C./D. with any text until next choice
    const choiceRegex = /([A-D])[\.\)]\s*(.+?)(?=\s+[A-D][\.\)]|$)/gi;
    const matches = [...fullText.matchAll(choiceRegex)];

    console.log('Total choice matches:', matches.length);

    // Count
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    matches.forEach(m => {
        const key = m[1].toUpperCase();
        if (counts[key] !== undefined) counts[key]++;
    });
    console.log('Choice counts:', counts);

    console.log('\nSample sequence (first 12):');
    matches.slice(0, 12).forEach((m, i) => {
        console.log(m[1].toUpperCase(), ':', m[2].substring(0, 50).replace(/\n/g, ' '));
    });
}

test().catch(e => console.error('Error:', e));
