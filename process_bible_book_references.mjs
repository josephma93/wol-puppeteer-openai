import log4js from 'log4js'
log4js.configure({
    appenders: {
        out: {
            type: 'stdout'
        }
    },
    categories: {
        default: {
            appenders: ['out'],
            level: 'debug'
        }
    },
});
import {getGPTJSONResponse} from "./core/gpt_calls.mjs";
import {generalJWRolePrompt, onlyJSONResponsePrompt, ownWordsPrompt} from "./core/general_prompts.mjs";
import {getJSONToProcess} from "./core/program_input.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeFileToDisk, writeJSONToDisk} from "./core/program_output.mjs";
import mustache from "mustache";

const promptBuilders = {
    generateTeachings(biblicalRef, biblicalCite, referenceText) {
        return (
            `Analiza la información delimitada por ### que fue usada en relación al texto biblico de '${biblicalRef}' y que dice: '${biblicalCite}'.
Quiero que expliques:
- (whatsTheRelationship) porque la informacion delimitada uso el texto biblico
- (howTheBibleSupportsTheReference) de que manera apoya el texto biblico el argumento de la informacion delimitada
- (whatCanWeLearn) que enseñanzas tiene la informacion delimitada que se puedan considerar perlas espirituales

Tu respuesta debe de ser entregada usando este formato de JSON:
{
  whatsTheRelationship: " ... ",
  howTheBibleSupportsTheReference: " ... ",
  whatCanWeLearn: [
    " ... ",
    " ... "
  ]
}

###
${referenceText}
###`
        );
    },
};

async function generateCommentForRelatedMaterial(prompt) {
    const completion = await getGPTJSONResponse([
        generalJWRolePrompt,
        onlyJSONResponsePrompt,
        ownWordsPrompt,
        {
            role: 'user',
            content: prompt,
        }
    ]);
    return JSON.parse(completion.choices[0].message.content);
}

/**
 * Represents a collection of scriptural citations with related references and analysis.
 * @typedef {ScripturalCitation[]} ScripturalCitations
 */

/**
 * Describes a scriptural citation, including the scripture itself and associated references.
 * @typedef {Object} ScripturalCitation
 * @property {string} citation - The reference to the specific scripture (e.g., "Salmo 3:encabezamiento").
 * @property {string} scripture - The text of the scripture cited (e.g., "Salmo de David, cuando huía de su hijo Absalón.").
 * @property {Reference[]} references - A list of references that relate to the scripture, including analysis and teachings.
 */

/**
 * Represents a reference to external material that provides analysis or commentary on the scripture.
 * @typedef {Object} Reference
 * @property {string} mnemonic - A mnemonic or identifier for the reference material (e.g., "w11 15/5 28").
 * @property {AIReasoning} aiReasoning - An object containing detailed analysis of the relationship between the reference material and the scripture, and the lessons that can be learned.
 */

/**
 * Contains detailed analysis and lessons derived from the scripture and the reference material.
 * @typedef {Object} AIReasoning
 * @property {string} whatsTheRelationship - Explains how the reference material relates to the scripture.
 * @property {string} howTheBibleSupportsTheReference - Describes how the scripture supports the analysis or conclusions of the reference material.
 * @property {string[]} whatCanWeLearn - Lists lessons or teachings that can be derived from the scripture and the reference analysis.
 */

/**
 * @param {BiblicalEntries} bookRefData
 * @returns {Promise<ScripturalCitations>}
 */
async function generateAIResults(bookRefData) {
    const log = log4js.getLogger('ai_process');
    let result = [];
    log.info('%d biblical references will be processed', bookRefData.entries.length);

    for (let i = 0; i < bookRefData.entries.length; i++) {
        const entry = bookRefData.entries[i];
        log.debug(`start reference processing for: '%s'`, entry.citation);
        const references = [];
        result.push({
            citation: entry.citation,
            scripture: entry.scripture,
            references,
        });

        log.info('%d mnemonics will be processed', entry.references.length);
        for (let j = 0; j < entry.references.length; j++) {
            const reference = entry.references[j];
            const log = log4js.getLogger('ai_process_mnemonic');
            try {
                const prompt = promptBuilders.generateTeachings(entry.citation, entry.scripture, reference.refContents);
                const aiReasoning = await generateCommentForRelatedMaterial(prompt);
                references.push({
                    mnemonic: reference.mnemonic,
                    aiReasoning,
                });
                log.info('mnemonic %d of %d was processed', j+1, entry.references.length);
            } catch (e) {
                log.info('mnemonic %d of %d failed', j+1, entry.references.length);
                log.error(e);
                // Dump what we have so far so that we don't have to start over.
                log.log(JSON.stringify(result));
            }
        }
        log.info('biblical reference %d of %d was processed', i+1, bookRefData.entries.length);
    }

    return result;
}

/**
 * @param {ScripturalCitations} aiResults
 * @returns {string}
 */
function buildMarkdownResult(aiResults) {
    return mustache.render(
`
{{#aiResults}}
## {{citation}}
> {{{scripture}}}

{{#references}}
### {{{mnemonic}}}
#### ¿Cómo se relaciona el material de referencia con el texto bíblico?
{{{aiReasoning.whatsTheRelationship}}}

#### ¿Cómo respalda el texto bíblico el análisis o las conclusiones del material de referencia?
{{{aiReasoning.howTheBibleSupportsTheReference}}}

#### ¿Qué podemos aprender?
{{#aiReasoning.whatCanWeLearn}}
- {{{.}}}
{{/aiReasoning.whatCanWeLearn}}

{{/references}}

{{/aiResults}}
`
        , {aiResults}
    );
}

/**
 * @param {ScripturalCitations} aiResults
 * @returns {string}
 */
function buildMeetingComments(aiResults) {
    return mustache.render(
`
{{#aiResults}}
## {{citation}}
> {{{scripture}}}

### ¿Qué podemos aprender?
{{#references}}
{{#aiReasoning.whatCanWeLearn}}
- {{{.}}}
{{/aiReasoning.whatCanWeLearn}}
{{/references}}

{{/aiResults}}
`
        , {aiResults}
    );
}

/**
 * @param {ScripturalCitations} aiResults
 * @returns {string}
 */
function buildMeetingCommentsWAFormat(aiResults) {
    return mustache.render(
`Comentarios para *{{bookCitation}}*


{{#aiResults}}
*{{citation}}*
> {{{scripture}}}

_¿Qué podemos aprender?_
{{#references}}
{{#aiReasoning.whatCanWeLearn}}
- {{{.}}}
{{/aiReasoning.whatCanWeLearn}}
{{/references}}

{{/aiResults}}`
        , {aiResults, bookCitation: aiResults[0].citation.split(':').shift()}
    ).trimEnd() + '\n';
}

/**
 * Represents the entire structure containing biblical entries with citations, scriptures, and references.
 * @typedef {Object} BiblicalEntries
 * @property {Entry[]} entries - An array of entry objects.
 */

/**
 * Represents a single entry in the biblical entries structure, including citation, scripture, and references.
 * @typedef {Object} Entry
 * @property {string} citation - The citation for the scripture, indicating the book, chapter, and verse.
 * @property {string} scripture - The scripture text.
 * @property {Reference[]} references - An array of reference objects related to the scripture.
 */

/**
 * Represents a reference related to a scripture, including a mnemonic and the reference contents.
 * @typedef {Object} Reference
 * @property {string} mnemonic - A mnemonic identifier for the reference.
 * @property {string} refContents - The detailed content of the reference, potentially including commentary or explanation.
 */

const log = log4js.getLogger("main");
log.info('program started');

const runsDir = await createRunsDirIfRequired('./runs/biblical_book_ai_runs');
const thisRunDir = await createThisRunDir(runsDir);

/** @type {BiblicalEntries} */
const jsonToProcess = await getJSONToProcess();

const aiResults = await generateAIResults(jsonToProcess);
await writeJSONToDisk(thisRunDir, 'aiResults.json', aiResults);

const markdownResult = buildMarkdownResult(aiResults);
await writeFileToDisk(thisRunDir, 'result.md', markdownResult);

const meetingComments = buildMeetingComments(aiResults);
await writeFileToDisk(thisRunDir, 'meeting_comments.md', meetingComments);

const meetingCommentsWAFormat = buildMeetingCommentsWAFormat(aiResults);
await writeFileToDisk(thisRunDir, 'meeting_comments_wa.md', meetingCommentsWAFormat);

log.info('program finished');
