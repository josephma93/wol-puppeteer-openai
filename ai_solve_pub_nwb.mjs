import log4js from "log4js";
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
import {getJSONToProcess} from "./core/program_input.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeJSONToDisk} from "./core/program_output.mjs";
import {generalJWRolePrompt, mnemonicPrompt, onlyJSONResponsePrompt} from "./core/general_prompts.mjs";
import {getGPT4JSONResponse, getGPTJSONResponse, getGPTResponse} from "./core/gpt_calls.mjs";

const promptBuilders = {
    /**
     * @param {MidWeekSpeechMaterial} midWeekSpeechMaterial
     * @returns {string}
     */
    speechMaterial(midWeekSpeechMaterial) {
        return (
            `Este es el material para un discurso, esta delimitado por ***. El h1 es el titulo del discurso, los h2 son los puntos clave y también especifican los textos clave (deben de ser leídos). Los h2 también contienen nemotécnico(s) a otras publicaciones que forman el material base para cada punto clave del discurso.

***
# ${midWeekSpeechMaterial.title}
${midWeekSpeechMaterial.mainPoints.map(mp => `## ${mp.citation.textWithRefsOnly}`).join('\n')}
${midWeekSpeechMaterial.mainPoints.map(mp => `${mp.citation.textWithRefsAndFootNotes2Levels.split('\n---\n')[0].trim()}`).join('\n')}

El material audio visual asociado al discurso incluye la${midWeekSpeechMaterial.figures.length === 1 ? '' : '(s)'} siguiente${midWeekSpeechMaterial.figures.length === 1 ? '' : '(s)'} imagen${midWeekSpeechMaterial.figures.length === 1 ? '' : '(es)'}:
${midWeekSpeechMaterial
    .figures
    .map(
        fig =>
            (fig.imageAlt ? `imageAlt: ${fig.imageAlt}\n` : '') +
            (fig.figcaptionText ? `título o leyenda que describe la imagen: ${fig.figcaptionText}\n` : '') +
            (fig.footnoteDescription ? `descripción de la imagen segun autores: ${fig.footnoteDescription}\n` : '')
    )
}
---
${midWeekSpeechMaterial.mainPoints.map(mp => `${mp.citation.textWithRefsAndFootNotes2Levels.split('\n---\n')[1].trim()}`).join('\n')}
***`
        );
    },

    /**
     * @param {MidWeekSpeechMaterial} midWeekSpeechMaterial
     * @returns {string}
     */
    speechGoal(midWeekSpeechMaterial) {
        return (
            `Basado en el material del discurso quiero que escribas qué busca enseñar el discurso, se conciso pero sin sacrificar puntos clave.`
        );
    },

    /**
     * @param {string} speechGoal
     * @returns {string}
     */
    speechIntros(speechGoal) {
        return (
`Basado en el material del discurso quiero que escribas 10 posibles introducciones al discurso.
Cada una de tus introducciónes debe captar la atención, indicar con claridad el tema del que se hablará y mostrar por qué este tema debería interesar a los oyentes.
Captar la atención se debe hacer escogiendo una de las siguientes: una pregunta, una afirmación, una refrán o "proverbio" relevante al tema, o una noticia del pasado relevante al tema o una historia breve, en cualquiera de los casos se busca despertar el interés de los oyentes.
Ten en cuenta que el objetivo del discurso es: \`${speechGoal}\`

Tu respuesta debe ser entregada en formato JSON de esta forma:
{
  intros: [
    "... intro 1 ...",
    "... intro 2 ...",
    "... intro n ...",
  ]
}`
        );
    }
};

function buildSpeechMaterialPromptMsgObj(midWeekSpeechMaterial) {
    const speechMaterial = promptBuilders.speechMaterial(midWeekSpeechMaterial);
    return {
        role: 'user',
        content: speechMaterial,
    };
}

/**
 * @param {MidWeekSpeechMaterial} midWeekSpeechMaterial
 * @returns {Promise<string>}
 */
async function generateSpeechGoal(midWeekSpeechMaterial) {
    const speechGoal = promptBuilders.speechGoal(midWeekSpeechMaterial);
    const completion = await getGPTResponse([
        generalJWRolePrompt,
        buildSpeechMaterialPromptMsgObj(midWeekSpeechMaterial),
        {
            role: 'user',
            content: speechGoal,
        },
    ]);
    return completion.choices[0].message.content;
}

/**
 * @param {MidWeekSpeechMaterial} midWeekSpeechMaterial
 * @param {string} speechGoal
 * @returns {Promise<{intros: string[]}>}
 */
async function generateSpeechIntros(midWeekSpeechMaterial, speechGoal) {
    const prompt = promptBuilders.speechIntros(speechGoal);
    const completion = await getGPT4JSONResponse([
        generalJWRolePrompt,
        buildSpeechMaterialPromptMsgObj(midWeekSpeechMaterial),
        {
            role: 'user',
            content: prompt,
        }
    ]);
    return JSON.parse(completion.choices[0].message.content);
}

/**
 * @param {MidWeekSpeechMaterial} midWeekSpeechMaterial
 */
async function generateAIResults(midWeekSpeechMaterial) {

    const log = log4js.getLogger("generate_ai");

    log.info('generating speech goal');
    const speechGoal = await generateSpeechGoal(midWeekSpeechMaterial);
    log.info('speech goal generated');

    log.info('generating speech intros');
    const speechIntros = await generateSpeechIntros(midWeekSpeechMaterial, speechGoal);
    log.info('speech intros generated');

    return {
        speechGoal,
        speechIntros,
    };
}

const log = log4js.getLogger("main");
log.info('program started');
/** @type {MidWeekSpeechMaterial} */const midWeekSpeechMaterial = await getJSONToProcess();

const aiResults = await generateAIResults(midWeekSpeechMaterial);
log.info('ai results generated');

const runsDir = await createRunsDirIfRequired('./runs/pub_mwb24_ai');
const thisRunDir = await createThisRunDir(runsDir);

const diskPath = await writeJSONToDisk(thisRunDir, 'aiResults.json', aiResults);
log.info('ai result written to: %s', diskPath);

log.info('program started');
