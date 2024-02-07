import OpenAI from "openai";
import {onlyJSONResponsePrompt} from "./general_prompts.mjs";
import log4js from 'log4js'

/**
 * Represents a chat completion response returned by the model, based on the provided input.
 * @typedef {Object} ChatCompletion
 * @property {string} id - A unique identifier for the chat completion.
 * @property {string} object - The object type, which is always "chat.completion".
 * @property {number} created - The Unix timestamp (in seconds) of when the chat completion was created.
 * @property {string} model - The model used for the chat completion.
 * @property {string} system_fingerprint - This fingerprint represents the backend configuration that the model runs with. Can be used in conjunction with the seed request parameter to understand when backend changes have been made that might impact determinism.
 * @property {Choice[]} choices - A list of chat completion choices. Can be more than one if n is greater than 1.
 * @property {Usage} usage - Usage statistics for the completion request.
 */

/**
 * Represents a choice from the chat completion options provided by the model.
 * @typedef {Object} Choice
 * @property {number} index - The index of the choice in the choices array.
 * @property {Message} message - The message part of the choice.
 * @property {null} logprobs - Log probabilities of the tokens, null in this context.
 * @property {string} finish_reason - The reason the generation was stopped, e.g., "stop".
 */

/**
 * Represents the message part of a chat completion choice.
 * @typedef {Object} Message
 * @property {string} role - The role of the message sender, e.g., "assistant".
 * @property {string} content - The content of the message.
 */

/**
 * Represents the usage statistics for the chat completion request.
 * @typedef {Object} Usage
 * @property {number} prompt_tokens - Number of tokens in the prompt.
 * @property {number} completion_tokens - Number of tokens in the generated completion.
 * @property {number} total_tokens - Total number of tokens used in the request (prompt + completion).
 */

const openai = new OpenAI();
const log = log4js.getLogger("gpt_calls");

export async function getGPTResponse(messages) {
    log.debug(`Calling GPT...`);
    const result = await openai.chat.completions.create({
        messages: messages,
        model: "gpt-3.5-turbo-0125",
        max_tokens: 1000,
    })
    log.debug(`GPT call done, usage: %j`, result.usage);
    return result;
}

export async function getGPTJSONResponse(messages) {
    log.debug(`Calling GPT...`);
    const result = await openai.chat.completions.create({
        messages: messages,
        model: "gpt-3.5-turbo-0125",
        max_tokens: 2000,
        response_format: {type: "json_object"},
    })
    log.debug(`GPT call done, usage: %j`, result.usage);
    return result;
}

export async function generateAIReasoning(prompt) {
    const completion = await getGPTJSONResponse([
        onlyJSONResponsePrompt,
        {
            role: 'user',
            content: prompt,
        }
    ]);
    return JSON.parse(completion.choices[0].message.content);
}