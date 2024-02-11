import {getJSONToProcess} from "./core/program_input.mjs";
import {generateAIReasoning, getGPTJSONResponse, getGPTResponse} from "./core/gpt_calls.mjs";
import {generalJWRolePrompt, onlyJSONResponsePrompt, ownWordsPrompt} from "./core/general_prompts.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeFileToDisk, writeJSONToDisk} from "./core/program_output.mjs";

const singleQuestionJSONResponsePrompt = {
    "role": "system",
    "content":
        `Usa esta estructura JSON para tu respuesta:
{
  cutToTheChase: " ... ",
  hasMultiplePoints: boolean,
  directAnswers: [
    "respuesta que cubre el punto/idea 1 de la respuesta o la respuesta completa",
    "respuesta que cubre el punto/idea 2",
    "respuesta que cubre el punto/idea",
    "..."
  ],
  hasSecondary: boolean,
  secondaryComments: [
    "respuesta que cubre una idea secundaria",
    "... escribir mas si es necesario ...",
  ],
  hasMainQuote: boolean,
  mainQuoteComment: " ... ",
  hasSecondaryQuotes: boolean,
  secondaryQuoteComments: [
    " ... ",
    " ... "
  ],
}`
}

const multiQuestionJSONResponsePrompt = {
    role: 'system',
    content:
        `Usa esta estructura JSON para tu respuesta:
{
  forQuestion1: { // Escribir un objeto para cada respuesta
    cutToTheChase: " ... ",
    hasMultiplePoints: boolean,
    directAnswers: [
      "respuesta que cubre el punto/idea 1 de la respuesta o la respuesta completa",
      "respuesta que cubre el punto/idea 2",
      "respuesta que cubre el punto/idea",
      "..."
    ],
    hasMainQuote: boolean,
    mainQuoteComment: " ... ",
  }
  forQuestion2: {}, // mismo formato que en forQuestion1
  forQuestionN: {}, // mismo formato que en forQuestion1 y forQuestion2
  analysisAcrossAllTheText: { // este objeto es requerido y debe estar presente siempre
    hasSecondary: boolean,
    secondaryComments: [
      "respuesta que cubre una idea secundaria",
      "... escribir mas si es necesario ...",
    ],
    hasSecondaryQuotes: boolean,
    secondaryQuoteComments: [
      " ... ",
      " ... "
    ],
  }
}`
};

const promptBuilders = {
    /**
     * @param {StudyArticle} wAsJson
     * @returns {string}
     */
    generalIdea(wAsJson) {
        return (
            `Basado en la estructura y el avance del articulo, cual es el la idea general del articulo?
___
# ${wAsJson.title}
Texto tematico: ${wAsJson.mainCite}
Avance del articulo: ${wAsJson.preview}
${wAsJson.subTitles.map(sub => `## ${sub}`).join('\n')}
Titulos de recuados con informacion suplementaria:
${wAsJson.body.map(section => section.supplements.map(sup => `### ${sup.title}`).join('\n')).join('\n').trim()}
`);
    },

    /**
     * @param {Question} question
     * @param {string} textToAnswer
     * @returns {string}
     */
    singleQuestion(question, textToAnswer) {
        return (
            String.raw`Usando unicamente la información delimitada por ### y su respectiva pregunta: '${question.text}'.
Todos tus comentarios/respuestas deben estar escrito "en tus propias palabras" lo que significa esta hecho expresando tu comprensión o interpretación del tema o texto usando tu propio lenguaje y estilo, en lugar de repetir o leer textualmente lo que está escrito.
Escribe cada parte del JSON apegado a estas indicaciones:
- (cutToTheChase: string) Escribe una respuesta que responda plenamente la pregunta planteada de manera sencilla y directa.
- (hasMultiplePoints: boolean) determina si la respuesta a la pregunta contiene varias "ideas" o "puntos" que conforman una sola respuesta larga.
- (directAnswers: string[])  Si 'hasMultiplePoints' es true, escribe una respuesta para abordar un punto a la vez, si 'hasMultiplePoints' es false, escribe una unica respuesta, en cualquier caso, debe ser corta(s), sencilla(s) y directa(s).
- (hasSecondary: boolean) Considerando las respuestas anteriores, determina si hay una o varias idea secundarias de relativa importancia o peso en la información delimitada que no fueron abordadas.
- (secondaryComments: string[]) Si 'hasSecondary' es true, escribe un comentario para cada idea, si 'hasSecondary' es false este array debe estar vacio.
- (hasMainQuote: boolean) Determina si el parrafo contiene una cita biblica principal (usualmente marcado como "lea", "lealo" o se hace mencion en la pregunta).
- (mainQuoteComment: string) Si 'hasMainQuote' es true, escribe un comentario explicando la cita biblia principal y su relación con la pregunta y la información delimitada y aplicaciones en la vida diaria como cristiano.
- (hasSecondaryQuotes: boolean) Determina si la informacion delimitada contiene citas biblicas secundarias (distintas a la "main quote") que apoyen puntos imporantes y no se han cubierto o que dan apoyo a la idea principal.
- (secondaryQuoteComments: string[]) Si 'hasSecondaryQuotes' es true, escribe comentarios comentario explicando cada una enfocandose en la su relación con la pregunta y la información delimitada y aplicaciones en la vida diaria como cristiano.
###
${textToAnswer}
###`
        );
    },

    /**
     * @param {Question} question
     * @param {string} textToAnswer
     * @returns {string}
     */
    multipleQuestions(question, textToAnswer) {
        return (
            String.raw`Usando unicamente la información delimitada por ### vas a responder las siguientes preguntas:
${question.letteredQuestionTexts.map((q, i) => (i + 1) + '. ' + q).join('\n')}
Para cada respuesta escribe un objecto dode cada parte del JSON este apegado a estas indicaciones:
- (cutToTheChase: string) Escribe una respuesta que responda plenamente la pregunta planteada de manera sencilla y directa.
- (hasMultiplePoints: boolean) determina si la respuesta a la pregunta contiene varias "ideas" o "puntos" que conforman una sola respuesta larga.
- (directAnswers: string[])  Si 'hasMultiplePoints' es true, escribe una respuesta para abordar un punto a la vez, si 'hasMultiplePoints' es false, escribe una unica respuesta, en cualquier caso, debe ser corta(s), sencilla(s) y directa(s).
- (hasMainQuote: boolean) Determina si el parrafo contiene una cita biblica principal (usualmente marcado como "lea", "lealo" o se hace mencion en la pregunta).
- (mainQuoteComment: string) Si 'hasMainQuote' es true, escribe un comentario explicando la cita biblia principal y su relación con la pregunta y la información delimitada y aplicaciones en la vida diaria como cristiano.

Escribe un unico objeto 'analysisAcrossAllTheText' requerido donde se aborda toda la informacion delimitada como una sola unidad.
Dentro de 'analysisAcrossAllTheText' usa estas indicaciones:
- (hasSecondary: boolean) Sin tomar en cuenta 'cutToTheChase', considera las respuestas anteriores y determina si hay una o varias ideas secundarias de relativa importancia o peso en la información delimitada que no fueron abordadas.
- (secondaryComments: string[]) Si 'hasSecondary' es true, escribe un comentario para cada idea, si 'hasSecondary' es false este array debe estar vacio.
- (hasSecondaryQuotes: boolean) Determina si la informacion delimitada contiene citas biblicas secundarias que apoyen puntos imporantes y no se han cubierto o que dan apoyo a la idea principal.
- (secondaryQuoteComments: string[]) Si 'hasSecondaryQuotes' es true, escribe comentarios comentario explicando cada una enfocandose en la su relación con la pregunta y la información delimitada y aplicaciones en la vida diaria como cristiano.
###
${textToAnswer}
###`
        );
    },

    /**
     * @param {string} questionText
     * @returns {string}
     */
    reasoningAboutReference(questionText) {
        return (
            String.raw`El texto delimitado por ### hace varias preguntas y hace mencion a algo que hay que ver (usualmente dentro de parentesis).
Quiero que que clasifiques lo que hay que ver en una de tres categorias:
- hasReferenceToImage: si es se indica que deberia de verse una imagen.
- hasReferenceToSupplement: si es se indica que deberia de verse un recuadro.
- hasReferenceToVideo: si es se indica que deberia de verse un video.
Las menciones a cualquier otra cosa que no este explicitamente mencionado aqui debe de ser ignorado.
Responde usando este formato:
{hasReferenceToImage: boolean, hasReferenceToSupplement: boolean, hasReferenceToVideo: boolean}

###
${questionText}
###`
        );
    },

    /**
     * @param {string} textReference
     * @returns {string}
     */
    reasoningRelevantParagraphs(textReference) {
        return (
            String.raw`Este texto: '${textReference}' dice que hay unos parrafos relacionados.
Quiero que escribas un objeto JSON donde esten definidos los parrafos relacionados.
Estos son ejemplos de lo que quiero:
- {relatedOnes: ["1"]}: indica un unico parrafo relevante
- {relatedOnes: ["10"]}: indica un unico parrafo relevante
- {relatedOnes: ["15", "16"]}: indica dos parrafos relevantes
- {relatedOnes: ["7", "8", "9"]}: indica tres parrafos relevantes (cuando se define un rango de parrafos)`
        );
    },

    /**
     * @param {Question} question
     * @param {string} relatedText
     * @param {Figure} figure
     * @returns {string}
     */
    commentForImage(question, relatedText, figure) {
        return (
            String.raw`Considerando que se esta analizando la informacion delimitada por ### con la(s) pregunta(s): '${question.text}'.
Escribe un comentario sobre la imagen a la que se hace referencia.
Usa este formato JSON para tu respuesta:
{
  teachings: [ // Escribe uno o mas comentarios cortos, sencillos y directos, el objetivo es resaltar que enseña esta imagen en el contexto, y si hay aplicaciones practicas para la vida diaria como cristiano.
    "..."
  ]
}
Esto es lo que se sabe de la imagen:
`
            + (figure.imageAlt ? `imageAlt: ${figure.imageAlt}\n` : '')
            + (figure.figcaptionText ? `título o leyenda que describe la imagen: ${figure.figcaptionText}\n` : '')
            + (figure.footnoteDescription ? `descripción de la imagen segun autores: ${figure.footnoteDescription}\n` : '')
            + `
###
${relatedText}
###`
        );
    },

    /**
     * @param {Question} question
     * @param {string} relatedText
     * @param {Supplement} supplement
     * @returns {string}
     */
    commentForSupplement(question, relatedText, supplement) {
        return (
            String.raw`Considerando que se esta analizando la informacion delimitada por ### con la(s) pregunta(s): '${question.text}'.
Escribe un comentario sobre el recuado (delimitado por @@@) al que se hace referencia.
Usa este formato JSON para tu respuesta:
{
  teachings: [ // Escribe uno o mas comentarios cortos, sencillos y directos, el objetivo es resaltar que enseña esta imagen en el contexto, y si hay aplicaciones practicas para la vida diaria como cristiano.
    "..."
  ]
}
@@@
# ${supplement.title}
${supplement.contents}
@@@
###
${relatedText}
###`
        );
    },

    /**
     * @param {string[]} listItems
     * @param {string} allArticleContents
     * @returns {string}
     */
    teachBlockQuestions(listItems, allArticleContents) {
        return (
String.raw`Considerando unicamente la información delimitada por ### escribe una respuesta clara, sencilla y directa para las siguientes preguntas:
${listItems.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Tus respuesta debe estar en formato JSON con esta forma:
{
  "1": " ... respuesta a pregunta 1 ...",
  "2": " ... respuesta a pregunta 2 ...",
  "n": " ... respuesta a pregunta n ..."
}

###
${allArticleContents}
###`
        );
    }
};

/**
 * @param {Paragraph[]} paragraphs
 * @returns {Map<string, string>}
 */
function buildParagraphsByNumberMap(paragraphs) {
    return paragraphs.reduce((a, p) => a.set(p.parNum, p.citationData.textWithRefsAndFootNotes), new Map());
}

/**
 * @param {Map<string, string>} paragraphsByNumberMap
 * @param {Question} question
 * @returns {string[]}
 */
function findParagraphsRelevantToQuestion(paragraphsByNumberMap, question) {
    let result = [];
    if (question.typeOfPCoverage === 'single') {
        result.push(paragraphsByNumberMap.get(question.pCovered));
    } else if (question.typeOfPCoverage === 'double') {
        const pNums = question.pCovered.split(', ');
        pNums.forEach(pNum => result.push(paragraphsByNumberMap.get(pNum)));
    } else {
        const [start, end] = question.pCovered.split('-').map(Number);
        for (let i = start; i <= end; i++) {
            result.push(paragraphsByNumberMap.get(String(i)))
        }
    }
    return result;
}

/**
 * @param {StudyArticle} wAsJson
 * @returns {Promise<string>}
 */
async function generateArticleGeneralIdea(wAsJson) {
    const prompt = promptBuilders.generalIdea(wAsJson);
    const completion = await getGPTResponse([
        generalJWRolePrompt,
        {
            role: 'user',
            content: prompt,
        }
    ]);
    return completion.choices[0].message.content;
}

/**
 * Object representing the structured response to a question, breaking down the answer into primary points, secondary comments, and quotations with their respective explanations.
 * @typedef {Object} SingleQuestionAnswer
 * @property {string} cutToTheChase - Direct, short, and simple answer.
 * @property {boolean} hasMultiplePoints - Determines if the answer to the question contains multiple "ideas" or "points" that make up a single, long answer.
 * @property {string[]} directAnswers - Array of direct, short, and simple answers. If the answer has multiple ideas, each entry addresses one point at a time; otherwise, it contains a single complete answer.
 * @property {boolean} hasSecondary - Indicates whether there are one or more secondary ideas of relative importance or weight in the paragraph that were not addressed in the direct answers.
 * @property {string[]} secondaryComments - Comments for each secondary idea, written if there are secondary ideas present.
 * @property {boolean} hasMainQuote - Determines if the paragraph contains a getJSONToProcess biblical quote.
 * @property {string} mainQuoteComment - A comment explaining the getJSONToProcess biblical quote and its relation to the question and the outlined information.
 * @property {boolean} hasSecondaryQuotes - Determines if the paragraph contains secondary biblical quotes that support important points.
 * @property {string[]} secondaryQuoteComments - Comments for the secondary biblical quotes, aiming to explain their relevance in the same manner as the getJSONToProcess quote comment.
 */

/**
 * @param {Question} question
 * @param {string[]} paragraphsForQuestion
 * @returns {Promise<SingleQuestionAnswer>}
 */
async function generateSingleQuestionAnswer(question, paragraphsForQuestion) {
    const prompt = promptBuilders.singleQuestion(question, paragraphsForQuestion.join('\n'));
    const completion = await getGPTJSONResponse([
        generalJWRolePrompt,
        onlyJSONResponsePrompt,
        singleQuestionJSONResponsePrompt,
        ownWordsPrompt,
        {
            role: 'user',
            content: prompt,
        }
    ]);
    return JSON.parse(completion.choices[0].message.content);
}

/**
 * Defines the structure for the response to a single question, including the getJSONToProcess points, direct answers, and getJSONToProcess biblical quote if present.
 *
 * @typedef {Object} QuestionResponse
 * @property {string} cutToTheChase - Direct, short, and simple answer.
 * @property {boolean} hasMultiplePoints Determines if the response consists of multiple ideas or points.
 * @property {string[]} directAnswers An array of direct answers, each addressing a single point or the complete response if only one point exists.
 * @property {boolean} hasMainQuote Indicates if there is a primary biblical quotation within the response.
 * @property {string} mainQuoteComment A comment explaining the primary biblical quote and its relevance to the question and the provided information.
 */

/**
 * Defines the structure for analyzing all provided information as a single unit, focusing on secondary ideas and biblical quotations.
 *
 * @typedef {Object} OverallAnalysis
 * @property {boolean} hasSecondary Determines if there are secondary ideas of relative importance not addressed in the primary responses.
 * @property {string[]} secondaryComments An array of comments for each secondary idea.
 * @property {boolean} hasSecondaryQuotes Indicates if there are secondary biblical quotations supporting important points or bolstering the getJSONToProcess idea.
 * @property {string[]} secondaryQuoteComments An array of comments for secondary biblical quotes, highlighting their support for the getJSONToProcess idea.
 */

/**
 * The getJSONToProcess object structure organizing responses and comments related to a series of questions, with a focus on biblical quotations and idea distribution.
 *
 * @typedef {Object} MultiQuestionAnswer
 * @property {QuestionResponse} forQuestion1 Details for the response to the first question.
 * @property {QuestionResponse} forQuestion2 Details for the response to the second question, following the same format as forQuestion1.
 * @property {QuestionResponse} forQuestionN Details for the response to subsequent questions, replicable for any number of questions.
 * @property {OverallAnalysis} [analysisAcrossAllTheText] Analysis of all provided information as a single unit, focusing on secondary ideas and quotations.
 */

/**
 * @param {Question} question
 * @param {string[]} paragraphsForQuestion
 * @returns {Promise<MultiQuestionAnswer>}
 */
async function generateLetteredQuestionAnswer(question, paragraphsForQuestion) {
    const prompt = promptBuilders.multipleQuestions(question, paragraphsForQuestion.join('\n'));
    const completion = await getGPTJSONResponse([
        generalJWRolePrompt,
        onlyJSONResponsePrompt,
        multiQuestionJSONResponsePrompt,
        ownWordsPrompt,
        {
            role: 'user',
            content: prompt,
        }
    ]);
    return JSON.parse(completion.choices[0].message.content);
}

/**
 * Represents the association of an item with visual or supplementary material. Only one can be true at a time.
 * @typedef {Object} MaterialAssociation
 * @property {boolean} hasReferenceToImage - Indicates if the item is associated with an image.
 * @property {boolean} hasReferenceToSupplement - Indicates if the item is associated with a supplementary material, such as a text box or additional information panel.
 * @property {boolean} hasReferenceToVideo - Indicates if the item is associated with a video.
 */

/**
 * @param {Question} question
 * @returns {Promise<MaterialAssociation>}
 */
async function generateMaterialAssociationReasoning(question) {
    const prompt = promptBuilders.reasoningAboutReference(question.text);
    return await generateAIReasoning(prompt);
}

/**
 * @param {Figure[]} figures
 * @param {Question} question
 */
function findFigureRelatedToQuestion(figures, question) {
    let result = figures[0];
    if (figures.length > 1) {
        let figFound = figures.find(
            f => f.paragraphReferenceData?.pCovered.some(
                p => question.pCovered.includes(p)
            ) ?? false
        );
        if (figFound) {
            result = figFound;
        }
    }
    return result
}

/**
 * @param {Figure} figure
 * @param {Map<string, string>} paragraphsByNumberMap
 * @returns {Promise<string[]>}
 */
async function findByAIParagraphsRelevantToImage(figure, paragraphsByNumberMap) {
    let paragraphsForQuestion = Array.from(paragraphsByNumberMap.values());
    if (figure.figcaptionText) {
        const prompt = promptBuilders.reasoningRelevantParagraphs(figure.figcaptionText);
        let {relatedOnes} = await generateAIReasoning(prompt);
        paragraphsForQuestion = [];
        relatedOnes.forEach(pNum => paragraphsForQuestion.push(paragraphsByNumberMap.get(pNum)));
    }
    return paragraphsForQuestion;
}

/**
 * @param {string} prompt
 * @return {Promise<{teachings: string[]}>}
 */
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
 * @param {Question} question
 * @param {Map<string, string>} paragraphsByNumberMap
 * @param {Figure[]} figures
 * @return {Promise<{teachings: string[]}>}
 */
async function generateImageComment(question, paragraphsByNumberMap, figures) {
    let figureRelatedToQuestion = findFigureRelatedToQuestion(figures, question);
    let paragraphsForQuestion = await findByAIParagraphsRelevantToImage(figureRelatedToQuestion, paragraphsByNumberMap);

    const prompt = promptBuilders.commentForImage(question, paragraphsForQuestion.join("\n"), figureRelatedToQuestion);
    return generateCommentForRelatedMaterial(prompt);
}

/**
 * @param {Question} question
 * @param {string[]} paragraphsForQuestion
 * @param {Supplement} supplement
 * @return {Promise<{teachings: string[]}>}
 */
async function generateSupplementComment(question, paragraphsForQuestion, supplement) {
    const prompt = promptBuilders.commentForSupplement(question, paragraphsForQuestion.join("\n"), supplement);
    return generateCommentForRelatedMaterial(prompt);
}

/**
 * @param {StudyArticle} wAsJson
 */
async function generateParagraphAnswers(wAsJson) {
    const result = [];

    for (const section of wAsJson.body) {
        const paragraphsByNumberMap = buildParagraphsByNumberMap(section.paragraphs);

        for (const question of section.questions) {
            const paragraphsForQuestion = findParagraphsRelevantToQuestion(paragraphsByNumberMap, question);

            try {
                if (question.logicalQCount === 1) {
                    const aiAnswer = await generateSingleQuestionAnswer(question, paragraphsForQuestion)
                    result.push({
                        isAboutP: true,
                        pCovered: question.pCovered,
                        logicalQCount: question.logicalQCount,
                        answer: aiAnswer,
                    });
                } else {
                    const aiAnswer = await generateLetteredQuestionAnswer(question, paragraphsForQuestion)
                    result.push({
                        isAboutP: true,
                        pCovered: question.pCovered,
                        answer: aiAnswer,
                    });
                }

                if (section.supplements.length > 1) {
                    console.error('Number of associated material is not supported, please update script');
                } else {
                    if (question.references.length) {
                        const materialAssociation = await generateMaterialAssociationReasoning(question);
                        if (materialAssociation.hasReferenceToImage) {

                            const aiAnswer = await generateImageComment(question, paragraphsByNumberMap, section.figures)
                            result.push({
                                isAboutImage: true,
                                pCovered: question.pCovered,
                                answer: aiAnswer,
                            });
                        } else if (materialAssociation.hasReferenceToSupplement) {
                            const aiAnswer = await generateSupplementComment(question, paragraphsForQuestion, section.supplements[0])
                            result.push({
                                isAboutSupplement: true,
                                pCovered: question.pCovered,
                                answer: aiAnswer,
                            });
                        }
                        // TODO: support materialAssociation.hasReferenceToVideo, materialAssociation.hasReferenceToBible
                    }
                }
            } catch (e) {
                // Dump what we have so far so that we don't have to start over.
                console.log(JSON.stringify(result, null, 2));
            }
        }
    }

    return result;
}

/**
 * @param {StudyArticle} wAsJson
 */
async function generateTeachBlockAnswers(wAsJson) {
    const allArticleContents  = wAsJson.body.map(s => s.paragraphs.map(p => p.citationData.rawText).join('\n')).join('\n');
    const prompt = promptBuilders.teachBlockQuestions(wAsJson.teachBlock.listItems, allArticleContents);
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

async function generateAIResults(wAsJson) {

    const generalIdea = await generateArticleGeneralIdea(wAsJson);
    const answers = await generateParagraphAnswers(wAsJson);
    const teachBlockAnswers = await generateTeachBlockAnswers(wAsJson);

    return {
        generalIdea,
        answers,
        teachBlockAnswers,
    };
}

function buildMarkdownResult(wAsJson, aiResults) {
    return (
`${wAsJson.articleNum}: *${wAsJson.title}*

*Idea general del artículo*:
${aiResults.generalIdea}

Formato:
️🎯💥 La respuesta al grano para la pregunta.
🎯 Puntos que responden la pregunta.
2️⃣ Comentario de una idea secundaria del párrafo.
✍️ Comentario del texto principal.
✍️2️⃣ Comentario de un texto secundario.

${aiResults.answers.map(item => {
    let result = `⟾⟾ ${item.pCovered} `;
    if (item.isAboutImage) {
        result += 'sobre la imagen  ⟽⟽\n'
        result += item.answer.teachings.map(a => `\t🎯 ${a}`).join('\n');
        result += '\n';
    } else if (item.isAboutSupplement) {
        result += 'sobre el recuadro ⟽⟽\n'
        result += item.answer.teachings.map(a => `\t🎯 ${a}`).join('\n');
        result += '\n';
    } else {
        result += '⟽⟽\n';
        if (item.logicalQCount === 1) {
            /** @type {SingleQuestionAnswer} */
            let answer = item.answer;
            
            result += `🎯💥 ${answer.cutToTheChase}\n\n`;
            
            if (answer.hasMultiplePoints) {
                // result += 'Dividida en puntos:\n'
                result += answer.directAnswers.map(a => `\t🎯 ${a}`).join('\n');
                result += '\n';
            }

            if (answer.hasSecondary) {
                result += '\n';
                result += answer.secondaryComments.map(a => `\t2️⃣ ${a}`).join('\n');
                result += '\n';
            }

            if (answer.hasMainQuote) {
                result += `\n\t✍️ ${answer.mainQuoteComment}\n`;
            }

            if (answer.hasSecondaryQuotes) {
                result += '\n';
                result += answer.secondaryQuoteComments.map(a => `\t✍️2️⃣ ${a}`).join('\n');
                result += '\n';
            }
        } else {
            /** @type {MultiQuestionAnswer} */
            let answer = item.answer;

            for (const entry of [...Object.entries(answer)].filter(([k]) => k !== 'analysisAcrossAllTheText')) {
                const [key, /** @type {QuestionResponse} */qResponse] = entry;
                
                const qNum = key.replace('forQuestion', '');
                
                const letters = {"1": "A","2": "B","3": "C","4": "D","5": "E",};
                result += `Pregunta ${letters[qNum]}:\n\t🎯💥 ${qResponse.cutToTheChase}\n`;
                
                if (qResponse.hasMultiplePoints) {
                    result += `\n`;
                    result += qResponse.directAnswers.map(a => `\t🎯 ${a}`).join('\n');
                }

                if (qResponse.hasMainQuote) {
                    result += `\n\n\t✍️ ${qResponse.mainQuoteComment}\n`;
                }
            }

            let analysisAcrossAllTheText = answer.analysisAcrossAllTheText;
            
            if (!analysisAcrossAllTheText) {
                return result;
            }
            
            if (analysisAcrossAllTheText.hasSecondary) {
                result += '\n';
                result += analysisAcrossAllTheText.secondaryComments.map(a => `\t️2️⃣ ${a}`).join('\n');
                result += '\n';
            }

            if (analysisAcrossAllTheText.hasSecondaryQuotes) {
                result += '\n';
                result += analysisAcrossAllTheText.secondaryQuoteComments.map(a => `\t✍️2️⃣ ${a}`).join('\n');
                result += '\n';
            }
        }
    }

    return result;
}).join('\n')}

*${wAsJson.teachBlock.title}*\n
${wAsJson.teachBlock.listItems.map((q, i) => `${q}\n\t🎯💥 ${aiResults.teachBlockAnswers[i + 1]}`).join('\n\n')}`
    );
}

const wAsJson = await getJSONToProcess();

const runsDir = await createRunsDirIfRequired('./runs/watchtower_ai_runs');
const thisRunDir = await createThisRunDir(runsDir);

const aiResults = await generateAIResults(wAsJson);
await writeJSONToDisk(thisRunDir, 'aiResults.json', aiResults);

const markdownResult = buildMarkdownResult(wAsJson, aiResults);
await writeFileToDisk(thisRunDir, 'result.md', markdownResult);