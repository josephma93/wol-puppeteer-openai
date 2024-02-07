import {getJSONToProcess} from "./core/program_input.mjs";
import {generateAIReasoning, getGPTJSONResponse, getGPTResponse} from "./core/gpt_calls.mjs";
import {generalJWRolePrompt, onlyJSONResponsePrompt, ownWordsPrompt} from "./core/general_prompts.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeFileToDisk, writeJSONToDisk} from "./core/program_output.mjs";



/**
 * Represents the getJSONToProcess structure of an article with religious content.
 * @typedef {Object} Article
 * @property {string} articleNum - The unique identifier of the article.
 * @property {string} title - The getJSONToProcess title of the article.
 * @property {string[]} subTitles - Subtitles within the article marking new sections or key points.
 * @property {string} mainCite - A central scripture or quote underpinning the theme of the article.
 * @property {string} preview - A summary of the article's content.
 * @property {ArticleSection[]} body - Major sections of the article.
 * @property {TeachBlock} teachBlock - A section designed for key questions or discussion points.
 */

/**
 * Defines a section within an article, containing titles, paragraphs, and additional elements.
 * @typedef {Object} ArticleSection
 * @property {string} title - The title of the section.
 * @property {Paragraph[]} paragraphs - Paragraphs of content within the section.
 * @property {Question[]} questions - Questions related to the section content.
 * @property {Figure[]} figures - Figures or images included within the section.
 * @property {Supplement[]} supplements - Additional informational content related to the section.
 */

/**
 * Represents a paragraph within a section of the article.
 * @typedef {Object} Paragraph
 * @property {string} parNum - The paragraph number, can be an empty string if not applicable.
 * @property {string} text - The textual content of the paragraph.
 */

/**
 * Type definition for coverage type of paragraph in a question.
 * Only allows the values "single" or "double".
 * "single" indicates the question covers content from a single paragraph.
 * "double" indicates the question covers content from multiple paragraphs.
 * @typedef {'single' | 'double' | 'range'} TypeOfPCoverage
 */

/**
 * Describes a question that provokes thought or review about the article's content.
 * @typedef {Object} Question
 * @property {TypeOfPCoverage} typeOfPCoverage - Indicates the paragraph coverage type.
 * @property {string} pCovered - The paragraph(s) the question refers to.
 * @property {string} text - The question text.
 * @property {number} logicalQCount - The number of logical questions contained.
 * @property {number} letteredQCount - The number of sub questions labeled with letters.
 * @property {string[]} letteredQuestionTexts - Text of sub questions labeled with letters.
 * @property {string[]} references - Any references or notes related to the question.
 */

/**
 * Type representing the coverage of paragraphs related to the figure.
 * @typedef {Object} ParagraphReferenceData
 * @property {TypeOfPCoverage} typeOfPCoverage - The type of paragraph coverage.
 * @property {string[]} pCovered - An array of strings representing the paragraphs covered.
 */

/**
 * Defines a figure or image within an article section, including its description and related information.
 * @typedef {Object} Figure
 * @property {string} [imageAlt=] - A brief description of the image for accessibility purposes.
 * @property {string} [figcaptionText=] - The caption text providing context or information.
 * @property {string} relatedParagraphs - Text mentioning which paragraph(s) number(s) the figure relates to.
 * @property {ParagraphReferenceData|null} [paragraphReferenceData=null] - Reference data about paragraphs related to the figure, can be null or an object.
 * @property {string} [footnoteDescription=] - A detailed description of the figure's significance.
 */

/**
 * Contains additional informational content or sidebars related to a section's topic.
 * @typedef {Object} Supplement
 * @property {string} title - The title of the supplemental content.
 * @property {string[]} figures - An array of strings, each representing a reference to a figure or image.
 * @property {string} contents - The textual content providing in-depth information or perspectives.
 */

/**
 * A special section designed for further discussion or personal study, encapsulating key questions or points.
 * @typedef {Object} TeachBlock
 * @property {string} title - The title indicating the nature of the discussion points.
 * @property {string[]} listItems - Questions or statements for critical thought derived from the article.
 */

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
     * @param {Article} wAsJson
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
    return paragraphs.reduce((a, p) => {
        a.set(p.parNum, p.text);
        return a;
    }, new Map());
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
 * @param {Article} wAsJson
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
 * @param {Article} wAsJson
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
 * @param {Article} wAsJson
 */
async function generateTeachBlockAnswers(wAsJson) {
    const allArticleContents  = wAsJson.body.map(s => s.paragraphs.map(p => p.text).join('\n')).join('\n');
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
✍️2️⃣ Comentario de una texto secundario.

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
// const aiResults = {"generalIdea":"La idea general del artículo es que Jehová siempre responde nuestras oraciones con amor y de una manera justa, y explora tanto lo que podemos esperar de Jehová en ese sentido, como lo que Jehová espera de nosotros al hacer peticiones. También aborda la importancia de cambiar algunas de nuestras peticiones para alinearnos con la voluntad de Jehová.","answers":[{"isAboutP":true,"pCovered":"1, 2","logicalQCount":1,"answer":{"cutToTheChase":"Jehová no responde nuestras oraciones de la manera que esperamos debido a varias razones que pueden incluir su perfecto tiempo, su sabiduría y nuestro entendimiento limitado de su voluntad.","hasMultiplePoints":true,"directAnswers":["Jehová no siempre responde nuestras oraciones de forma inmediata o como esperamos.","Las respuestas de Jehová pueden estar basadas en su sabiduría y perfecto tiempo, que a veces difieren de nuestros deseos.","Nuestro entendimiento limitado puede llevarnos a interpretar erróneamente por qué Jehová no responde nuestras oraciones."],"hasSecondary":true,"secondaryComments":["Es importante recordar que Jehová conoce nuestras necesidades y sabe lo que es mejor para nosotros.","Debemos confiar en que Jehová responde a nuestras oraciones de acuerdo a su voluntad y plan para cada uno de nosotros."],"hasMainQuote":true,"mainQuoteComment":"El Salmo 37:4 nos recuerda la importancia de deleitarnos en Jehová, lo cual puede influir en los deseos de nuestro corazón. Esta cita nos enseña que es crucial buscar la voluntad de Jehová y confiar en su plan para nosotros en lugar de simplemente esperar que nuestras oraciones sean respondidas como lo deseamos.","hasSecondaryQuotes":false}},{"isAboutP":true,"pCovered":"3","logicalQCount":1,"answer":{"cutToTheChase":"En este artículo analizaremos qué podemos esperar de Jehová, qué espera Jehová de nosotros y por qué a veces es necesario cambiar nuestras peticiones.","hasMultiplePoints":true,"directAnswers":["Analizaremos qué podemos esperar de Jehová.","Se explorará qué espera Jehová de nosotros.","También se abordará por qué a veces es necesario cambiar nuestras peticiones."],"hasSecondary":false,"secondaryComments":[],"hasMainQuote":true,"mainQuoteComment":"El Salmo 65:2 nos presenta la idea de que Jehová escucha nuestras oraciones, lo que nos da la confianza de que realmente nos escucha y responde a nuestras peticiones según su voluntad y sabiduría divina.","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"4","logicalQCount":1,"answer":{"cutToTheChase":"Jehová nos ha prometido escuchar nuestras oraciones.","hasMultiplePoints":true,"directAnswers":["Jehová nos promete escuchar nuestras oraciones.","El amor de Dios por sus siervos se refleja en que jamás pasa por alto sus oraciones.","No siempre recibiremos todo lo que le pedimos de inmediato, algunas peticiones pueden ser concedidas en el nuevo mundo."],"hasSecondary":true,"secondaryComments":["Es importante recordar que la respuesta a nuestras oraciones puede no ser inmediata y debemos confiar en que Jehová sabe lo que es mejor para nosotros.","El amor y la paciencia de Jehová se manifiestan al considerar nuestras oraciones, demostrando su cuidado por nosotros."],"hasMainQuote":false,"mainQuoteComment":"","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"5","logicalQCount":1,"answer":{"cutToTheChase":"Jehová tiene en cuenta su propósito al escuchar nuestras oraciones, el cual incluye que la Tierra esté llena de personas que acepten su gobierno y le sirvan felizmente en unidad.","hasMultiplePoints":true,"directAnswers":["Parte del propósito de Jehová al responder nuestras oraciones es que la Tierra esté llena de personas que acepten su gobierno y le sirvan felizmente en unidad.","Jehová permitió que los humanos se gobernasen a sí mismos para demostrar que las afirmaciones de Satanás eran mentira, lo cual ha resultado en muchos problemas hoy en día."],"hasSecondary":true,"secondaryComments":["Se destaca que si Jehová resolviera todos los problemas causados por la gobernación humana, algunos podrían pensar que los humanos pueden manejar exitosamente sus asuntos y resolver los problemas del mundo."],"hasMainQuote":false,"mainQuoteComment":"","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"6","logicalQCount":1,"answer":{"cutToTheChase":"Es importante estar convencidos de que Jehová siempre actúa con amor y justicia para mantener nuestra confianza en él y en sus respuestas, incluso si no entendemos completamente sus razones.","hasMultiplePoints":true,"directAnswers":["Mantener nuestra confianza en Jehová.","Reconocer que puede responder de diversas maneras a nuestras peticiones."],"hasSecondary":true,"secondaryComments":["A veces nuestras oraciones pueden no recibir la respuesta que esperamos, pero eso no significa que Jehová no actúe con amor y justicia.","Es importante recordar que nuestra perspectiva es limitada y confiar en que Jehová siempre hace lo que es mejor para nosotros a largo plazo."],"hasMainQuote":false,"mainQuoteComment":"","hasSecondaryQuotes":true,"secondaryQuoteComments":["Deut. 32:4 y Apoc. 21:14 nos recuerdan que Jehová es justo en todas sus acciones y que ama a todos sus siervos por igual.","Job 33:13 nos enseña a no cuestionar las decisiones de Jehová, sino a confiar en su amor y justicia en todo momento."]}},{"isAboutP":true,"pCovered":"7","logicalQCount":1,"answer":{"cutToTheChase":"Evitamos comparar nuestra situación con la de los demás, reconociendo que Jehová tiene el control y que su propósito es eliminar todo sufrimiento y resucitar a sus queridos siervos.","hasMultiplePoints":true,"directAnswers":["Evitamos comparar nuestra situación con la de los demás, confiando en que Jehová tiene un propósito para cada uno de nosotros.","Reconocemos que Jehová tiene el control y que su plan es eliminar todo sufrimiento y resucitar a sus amados siervos."],"hasSecondary":true,"secondaryComments":["Es importante mantener la confianza en Jehová incluso cuando las circunstancias no parecen favorables.","Entendemos que cada persona es única y que Jehová actúa según su sabiduría y amor, no según nuestras comparaciones con otros."],"hasMainQuote":true,"mainQuoteComment":"La cita de Job 14:15 nos recuerda que Jehová tiene el poder de resucitar a sus siervos queridos y eliminar todo sufrimiento en su debido tiempo, lo que nos enseña a confiar en su promesa de un futuro mejor.","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"8","answer":{"forQuestion1":{"cutToTheChase":"Jehová nos promete ayudarnos a atravesar cualquier prueba y no permitir que nada nos haga daño permanente.","hasMultiplePoints":true,"directAnswers":["Jehová nos ayuda a 'atravesar' cualquier prueba.","Jehová no permitirá que nada nos haga daño permanente.","Jehová nos da su poderoso espíritu para ayudarnos a aguantar."],"hasMainQuote":true,"mainQuoteComment":"La cita de Isaías 43:2 nos muestra una comparación de los problemas como ríos y llamas, indicando que Jehová promete ayudarnos a superar esas dificultades y protegernos del daño permanente."},"forQuestion2":{"cutToTheChase":"La oración nos ayuda a mantenernos fieles y aguantar durante las pruebas difíciles.","hasMultiplePoints":false,"directAnswers":["La oración fortalece nuestra relación con Jehová y nuestra fe.","A través de la oración, recibimos consuelo y fortaleza para enfrentar las dificultades."],"hasMainQuote":false,"mainQuoteComment":""},"analysisAcrossAllTheText":{"hasSecondary":false,"secondaryComments":[],"hasSecondaryQuotes":false,"secondaryQuoteComments":[]}}},{"isAboutP":true,"pCovered":"9","logicalQCount":1,"answer":{"cutToTheChase":"Santiago 1:6, 7 destaca la importancia de confiar en que Jehová nos ayudará al enseñarnos a orar con fe y confianza en sus promesas.","hasMultiplePoints":true,"directAnswers":["Santiago 1:6 nos insta a pedir con fe, sin dudar, confiando en que Jehová escuchará y responderá nuestras oraciones.","El versículo 7 nos advierte sobre la importancia de orar con convicción, sin vacilar en nuestra creencia en la ayuda de Dios."],"hasSecondary":false,"secondaryComments":[],"hasMainQuote":true,"mainQuoteComment":"La cita de Santiago 1:6, 7 nos enseña a confiar plenamente en la respuesta de Jehová a nuestras oraciones, resaltando la importancia de mantener la fe y la confianza en él, superando así cualquier duda que pueda surgir durante las pruebas de la vida diaria.","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"10","logicalQCount":1,"answer":{"cutToTheChase":"Un ejemplo de poner de nuestra parte después de orar es cuando un hermano pide a Jehová ayuda para conseguir permiso del jefe para asistir a la asamblea regional. Aunque Jehová le puede dar valor para hablar con el jefe, el hermano debe tomar acción y hablar con él, proponer soluciones como cambiar turnos, e incluso estar dispuesto a no ser remunerado por ese tiempo.","hasMultiplePoints":true,"directAnswers":["Jehová puede dar valor para hablar con el jefe.","El hermano debe poner de su parte e ir a hablar con el jefe, incluso proponer soluciones como intercambiar turnos.","El hermano podría estar dispuesto a no ser remunerado por ese tiempo libre si es necesario."],"hasSecondary":false,"secondaryComments":[],"hasMainQuote":false,"mainQuoteComment":"","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"11","logicalQCount":1,"answer":{"cutToTheChase":"Debemos orar con insistencia para demostrar a Jehová que nuestra petición no es un simple capricho y que tenemos fe en que él puede ayudarnos.","hasMultiplePoints":true,"directAnswers":["Oremos con insistencia para demostrar que nuestra petición no es un simple capricho.","Al orar fervorosamente le mostramos a Jehová que confiamos en que él puede ayudarnos."],"hasSecondary":false,"secondaryComments":[],"hasMainQuote":false,"mainQuoteComment":"","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"12","answer":{"forQuestion1":{"cutToTheChase":"Podríamos preguntarnos si lo que estamos pidiendo en nuestras oraciones es lo más indicado, teniendo en cuenta si es lo mejor para nosotros a largo plazo y si está de acuerdo con la voluntad de Jehová.","hasMultiplePoints":true,"directAnswers":["¿Lo que estoy pidiendo, ¿es lo más indicado?","¿Está lo que pido en acuerdo con la voluntad de Jehová?","¿Es lo que pido lo mejor para mí a largo plazo?"],"hasMainQuote":true,"mainQuoteComment":"La petición de los padres en el párrafo 1, donde pedían a Jehová que hiciera que su hijo siguiera en la verdad, sirve como ejemplo. Jehová espera que cada uno tome la decisión de adorarlo por su propia voluntad, por lo que en lugar de pedir que su hijo sea obligado a servirle, podrían haber pedido ayuda para llegar al corazón de su hijo y que él ame a Jehová y quiera ser su amigo."},"forQuestion2":{"cutToTheChase":"Para que nuestras oraciones sean respetuosas debemos tener en cuenta que debemos pedir en armonía con la voluntad de Jehová, considerando lo que es lo mejor para nosotros y otras personas a largo plazo.","hasMultiplePoints":false,"directAnswers":["Para que nuestras oraciones sean respetuosas, debemos pedir en armonía con la voluntad de Jehová."],"hasMainQuote":false,"mainQuoteComment":""},"analysisAcrossAllTheText":{"hasSecondary":false,"secondaryComments":[],"hasSecondaryQuotes":true,"secondaryQuoteComments":["La cita de 1 Juan 5:14 menciona la importancia de pedir de acuerdo con la voluntad de Jehová, lo cual resalta la relevancia de este principio al hacer nuestras peticiones en oración.","Las referencias bíblicas en Deuteronomio y Proverbios, así como Efesios, nos enseñan la importancia de criar a nuestros hijos en la adoración a Jehová y cómo nuestras oraciones deben reflejar ese deseo."]}}},{"isAboutSupplement":true,"pCovered":"12","answer":{"teachings":["Este recuadro destaca la importancia de respetar a Jehová al hacer nuestras peticiones en oración.","Enseña que debemos pedir con buenos motivos, estar en línea con la voluntad de Dios y no ser egoístas en nuestras peticiones.","Aplica a la vida diaria recordándonos ser agradecidos y confiar en que Jehová sabe lo que es mejor para nosotros, incluso si la respuesta no es lo que esperamos."]}},{"isAboutP":true,"pCovered":"13","logicalQCount":1,"answer":{"cutToTheChase":"Jehová nos ayuda en el momento que considera más adecuado.","hasMultiplePoints":true,"directAnswers":["Jehová sabe cuál es el mejor momento para ayudarnos.","Si no recibimos lo que pedimos de inmediato, puede que sea porque Jehová considera que es 'Todavía no'."],"hasSecondary":true,"secondaryComments":["Es importante confiar en que Jehová sabe cuándo es el momento adecuado para responder nuestras oraciones.","Nuestra fe se fortalece al esperar en Jehová y recibir lo que realmente necesitamos en el momento oportuno."],"hasMainQuote":true,"mainQuoteComment":"La cita bíblica de Hebreos 4:16 nos recuerda que podemos acercarnos confiadamente a Jehová en busca de ayuda en el momento que Él considere más apropiado, confiando en Su sabiduría y amor por nosotros como sus siervos.","hasSecondaryQuotes":true,"secondaryQuoteComments":["La cita de Job 1:9-11; 2:4 nos muestra la importancia de confiar en Jehová y en sus tiempos para responder nuestras oraciones, confiando en Su sabiduría.","Las promesas de Isaías 33:24 y Apocalipsis 21:3, 4 nos revelan que Jehová tiene un propósito futuro de acabar con todas las enfermedades, brindándonos esperanza y confianza en Su poder y amor."]}},{"isAboutP":true,"pCovered":"14","logicalQCount":1,"answer":{"cutToTheChase":"El ejemplo de Janice enseña la importancia de confiar en Jehová, mejorar constantemente, y encontrar felicidad a pesar de las circunstancias.","hasMultiplePoints":true,"directAnswers":["La necesidad de confiar más en Jehová.","La importancia de mejorar hábitos personales, en este caso, los hábitos de estudio.","Aprender que la felicidad no depende de las circunstancias."],"hasSecondary":true,"secondaryComments":["La importancia de percibir las respuestas de Jehová aun cuando no sean como esperamos.","Agradecer a Jehová por las oportunidades que nos brinda para experimentar su amor y bondad."],"hasMainQuote":false,"mainQuoteComment":"","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutP":true,"pCovered":"15","logicalQCount":1,"answer":{"cutToTheChase":"A veces es bueno que nuestras oraciones sean menos específicas para poder percibir la voluntad de Jehová para nosotros.","hasMultiplePoints":true,"directAnswers":["Ser específicos en nuestras oraciones es bueno, pero a veces es mejor dejar espacio para la voluntad de Jehová.","Permitir que Jehová dirija nuestras vidas puede llevarnos a descubrir mejores oportunidades de servicio.","En lugar de ser excesivamente específicos, también podemos pedir sabiduría para ver cómo ampliar nuestro ministerio de diferentes maneras."],"hasSecondary":false,"secondaryComments":[],"hasMainQuote":false,"mainQuoteComment":"","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}},{"isAboutImage":true,"pCovered":"15","answer":{"teachings":["La imagen muestra a dos hermanas orando antes de llenar la solicitud para la Escuela de Evangelizadores del Reino. Una es invitada y la otra no, pero la hermana no invitada decide orar a Jehová y buscar otras maneras de expandir su ministerio.","La lección enseñada es que, aunque es válido ser específico en las oraciones, a veces es beneficioso no serlo tanto para percibir la voluntad de Jehová. Podemos pedirle a Dios que nos ayude a encontrar otras maneras de servirle y expandir nuestro ministerio, como lo hizo la hermana en la imagen."]}},{"isAboutP":true,"pCovered":"16","logicalQCount":1,"answer":{"cutToTheChase":"Podemos estar convencidos de que Jehová responderá nuestras oraciones con amor y justicia, nunca pasará por alto nuestras peticiones.","hasMultiplePoints":true,"directAnswers":["Podemos confiar en que Jehová responderá nuestras oraciones según su amor y justicia.","Aunque sus respuestas pueden no ser lo que esperamos, nunca nos abandonará.","Se nos anima a confiar en Jehová en todo momento y a expresar nuestros sentimientos en oración."],"hasSecondary":true,"secondaryComments":["Se destaca la importancia de confiar en que Jehová siempre responderá nuestras oraciones, incluso si la respuesta no es lo que esperamos.","Se enfatiza la necesidad de mantener una relación continua de oración con Jehová, derramando nuestros corazones delante de él."],"hasMainQuote":true,"mainQuoteComment":"El Salmo 62:8 nos anima a confiar plenamente en Jehová, expresando nuestros pensamientos y sentimientos en oración. Esto nos ayuda a fortalecer nuestra relación con Dios y a mantener una comunicación constante con él.","hasSecondaryQuotes":false,"secondaryQuoteComments":[]}}],"teachBlockAnswers":{"1":"Podemos esperar de Jehová que escuche nuestras oraciones con amor y justicia, teniendo en cuenta su propósito y respondiendo de acuerdo a ello. Jehová nos promete su apoyo para superar las pruebas, dándonos lo que necesitamos para mantenernos fieles.","2":"Jehová espera de nosotros que confiemos en Él, que oremos con fe y persistencia, y que hagamos nuestra parte después de orar. Además, debemos estar dispuestos a aceptar que las respuestas de Jehová pueden ser diferentes a lo que esperamos, pero siempre serán guiadas por su amor y sabiduría.","3":"Pudiera ser necesario cambiar algunas de nuestras peticiones para alinearlas con la voluntad de Jehová y su tiempo perfecto. Podemos reflexionar sobre si lo que pedimos es lo más indicado, si es el momento adecuado para recibirlo y si nuestra solicitud es demasiado específica, considerando siempre que Jehová responderá nuestras oraciones conforme a su amor y justicia."}};
await writeJSONToDisk(thisRunDir, 'aiResults.json', aiResults)
const markdownResult = buildMarkdownResult(wAsJson, aiResults);
// console.log(markdownResult);
await writeFileToDisk(thisRunDir, 'result.md', markdownResult);