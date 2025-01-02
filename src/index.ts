import 'dotenv/config';

import { CompletionModels, EmbeddingIndex, dedupeByProperty, getEmbedding, getStructuredCompletion } from "./helpers.ts";
import fs, { createReadStream } from 'fs';

import csv from 'csv-parser'
import { z } from "zod";

export const ICD10CodeSchema = z.object({ code: z.string(), description: z.string(), evidence: z.string() })
export const CodeResponseSchema = z.object({ codes: z.array(ICD10CodeSchema) })
export const PatientReviewSchema = z.object({ review: z.array(z.object({ code: z.string(), accept: z.boolean(), reason: z.string() })) })

interface ICD10Code {
    code: string,
    description: string,
}

interface ICD10EmbCode extends ICD10Code {
    emb: number[]
}


async function main() {

    const embeddings: ICD10EmbCode[] = JSON.parse(fs.readFileSync("icd10_top200_emb.json", "utf-8"));
    const numDimensions = 1536;
    const maxElements = 200;
    const index = new EmbeddingIndex(numDimensions, maxElements);
    index.addItems(embeddings);


    const codeDescriptions = new Map<string, string>()
    await new Promise((resolve, reject) => {
        createReadStream('icd10_top200.csv')
            .pipe(csv())
            .on('data', (data) => codeDescriptions.set(data.code, data.description))
            .on('end', () => {
                resolve(true);
            })
            .on('error', (error) => {
                reject(error);
            })
    })


    //Implement a system of agents to process medical text and generate ICD-10 codes as described in the referenced paper.
    // The system should focus on getting agents to work together effectively and output data in the expected format.
    async function codeNotes(input: string): Promise<z.infer<typeof ICD10CodeSchema>[]> {

        const symptomsRes = await getStructuredCompletion({
            model: CompletionModels.gpt4o,
            schema: z.object({ symptoms: z.string().array() }),
            system: `You are a physician who treats patients. Please check the patient notes and provide a list of symptoms.
        Each symptom should be similar to a ICD-10 code description. Don't include the actual code.`,
            user: `Medical notes:\n${input}`
        })

        if (!symptomsRes) {
            throw new Error("No symptoms");
        }


        const symptomEmbsProms = symptomsRes.symptoms.map(async symptom => {
            return await getEmbedding(symptom, "small")
        })
        const symptomEmbs = await Promise.all(symptomEmbsProms)

        const candidateCodes = dedupeByProperty("code", symptomEmbs.flatMap((emb) => {
            const { neighbors } = index.searchNearest(emb);
            return neighbors.filter(n => n.code != undefined).map((n) => ({
                code: n.code,
                description: codeDescriptions.get(n.code!),
            }))

        }))


        // doctor generates assessment and plan sections
        const ap = await getStructuredCompletion({
            model: CompletionModels.gpt4o,
            schema: z.object({ assessment: z.string(), plan: z.string() }),
            system: `You are a physician who treats patients. You strive to provide the best service to each patient. Based on
        the Subject and Objective, you will generate the assessment and plan for the EHR note.`,
            user: input
        });

        if (!ap) {
            throw new Error("No assessment and plan");
        }


        // The physician compares the generated assessment and plan with the original gold standard
        // assessment and plan section to check for accuracy and completeness, identfy inconsistencies and
        // generate the ICD codes.
        const physicianCodes = await getStructuredCompletion({
            model: CompletionModels.gpt4o,
            schema: CodeResponseSchema,
            system: `You are a physician who treats patients. Please check the generated assessment and plan against the
    gold standard assessment and plan. Please pay attention to the inconsistencies You assign ICD-10 codes
    to the note. You assign as many as possible ICD-10 codes and explain the reasons for each code. Select codes from the following list: ${JSON.stringify(candidateCodes)} `,
            user: `Original medical notes: ${input}\n\n Generated assessment ${ap?.assessment}\n\n Generated plan: ${ap?.plan}`
        })

        if (!physicianCodes) {
            throw new Error("No physician codes");
        }


        const patientReview = await getStructuredCompletion({
            model: CompletionModels.gpt4o,
            schema: PatientReviewSchema,
            system: `You are a patient who receieved treatment at the hospital. You cooperate fully with the
    health care system to receive the best service possible. You only accept ICD-10 codes that accurately reflect your conditions and symptoms to avoid being
    overbilled. You check all assigned ICD-10 codes, if you feel that a code is not needed, you reject it and explain why.
    You have divulged all symptoms to the physician and the physician's notes are accurate.`,
            user: `Physician Notes:\n${input}\n\nPhysician Codes:\n${JSON.stringify(physicianCodes.codes)}\n`
        })

        if (!patientReview) {
            throw new Error("No patient review");
        }


        const disputes = patientReview.review
            .filter(c => c.accept == false)
            .map(c => ({ code: c.code, description: codeDescriptions.get(c.code!) }))

        const adjustorReview = await getStructuredCompletion({
            model: CompletionModels.gpt4o,
            schema: CodeResponseSchema,
            system: `When a patient or a physician has different thoughts about the ICD-10 codes, you will review the
 notes and the ICD codes assigned by the physician. You can add or remove the assigned codes to make them accurate.
 Your duty is to ensure that the assigned ICD-10 codes are valid and exact.
 You assign all possible ICD-10 codes and explain the reasons for each code.
 Select codes from the following list: ${JSON.stringify(candidateCodes)} `,
            user: `Physician Notes:\n${input}\n\nPhysician Codes:\n${JSON.stringify(physicianCodes.codes)}\n
Patient disputes:\n${JSON.stringify(disputes)}\n\nICD-10 Documentation:\n${JSON.stringify(disputes)}`
        })

        if (!adjustorReview) {
            throw new Error("No adjustor review");
        }



        return adjustorReview.codes

    }



    const input = `An 18-year-old male patient presented to the emergency department with severe headache and fever due to lack of improvement with conventional treatment of viral upper respiratory infections.
Among the personal history, only infectious mononucleosis stands out.
After a catarrhal of one week of evolution, with general malaise, dry cough and fever(up to 38.5 oC), the patient develops global headache, more intense in the frontal region, in the last 48 hours, initially without rhinorrhea.
    Isolatedly, he had minimal purulent nasal secretion that has ever been bloody in recent days.
You have not had loss of consciousness, seizures, thiram, or chills.
On physical examination, we found: Ta: 37.5 oC; TA: 137 / 73 mmHg; P: 71 bpm.
Good general appearance with proper hydration and mucocutaneous perfusion.
    She's not impressive.
Febrile faces.
No painful spots in the percussion of the sinuses
A skin rash maculous and erythematous neck affects the trunk and neck.
    Laterocervical, axillary, or inguinal lymphadenopathies are not present.
Cardiac auscultation revealed crack, without murmurs.
Pulmonary auscultation revealed a conserved vesicular murmur, with no presence of roncus, crackles or wheezing.
The abdomen is blunt, depressible and does not have masses or enlargement.
The upper and lower extremities do not present pathological data, with distal pulses present.
The neurological examination is strictly normal, with no data on focality or meningism.
The corresponding complementary examinations were performed, with a rigorously normal chest X - ray, non - pathological urine analysis and blood count, highlighting leukocytosis with the presence of young sinuses(cayed: 0, 3dl) and differential diagnosis of glucose.
At the same time, a radiographic study of the paranasal sinuses in which no data compatible with sinusitis were observed; then, to rule out complications(such as thrombosis of the left cranial sinus or related encephalitis), the study showed.
1.
Once confirmed in the diagnosis of sinusitis in the cephalosporin, it was decided to admit the patient to the hospital for a correct evolutionary surveillance of the patient and start intravenous antibiotic treatment with third generation cephalosporins, treatment with ceasymptomised headache 48 hours without complications.`

    codeNotes(input).then(console.log).catch(console.error);
}


main()


