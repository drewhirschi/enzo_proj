import 'dotenv/config';

import fs, { createReadStream } from 'fs';

import csv from 'csv-parser'
import { getEmbedding } from "./helpers.ts";

async function createEmbeddings() {


    const rows: { code: string, description: string }[] = await new Promise((resolve, reject) => {
        const results: { code: string, description: string }[] = [];
        createReadStream('icd10_top200.csv')
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
                resolve(results);
            });
    })

    const embProms = rows.map(async (row) => {
        const emb = await getEmbedding(row.description, "small")
        return { ...row, emb }
    })

    const embs = await Promise.all(embProms)

    fs.writeFileSync("icd10_top200_emb.json", JSON.stringify(embs))


}

createEmbeddings().then(() => console.log("done"))

