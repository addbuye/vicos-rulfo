import { genkit } from 'genkit';
import { googleAI, gemini } from '@genkit-ai/googleai';
import { defineFlow } from '@genkit-ai/flow';
import { z } from 'zod';
import { getPageDataById, getAllPagesData, getAllNotesData, getPageById } from './firebaseService.js';

const ai = genkit({
    plugins: [
        googleAI()
    ],
    model: gemini(''),
    enableTracingAndMetrics: true,
});

export const summarizePageFlow = ai.defineFlow(
    {
        name: 'summarizePage',
        inputSchema: z.object({ pageId: z.string(), uid: z.string(), }),
        outputSchema: z.object({ summary: z.string(), pageTitle: z.string().optional() }),
    },
    async (input) => {
        const uid = input.uid;
        const pageData = await getPageDataById(input.pageId, uid);

        if (!pageData || !pageData.llmInputText) {
            throw new Error(`Can't get page content for page ${input.pageId}, or page not found for the current user.`);
        }

        const llmResponse = await ai.generate({
            prompt: `Summarize the next text in 2-4 sentences:\n\n${pageData.llmInputText}`,
            config: {
                temperature: 0.3,
            },
        });

        return {
            summary: llmResponse.text,
            pageTitle: pageData.title,
        };
    }
);

export const answerQuestionFlow = defineFlow(
    {
        name: 'answerQuestion',
        inputSchema: z.object({ question: z.string(), uid: z.string(), }),
        outputSchema: z.object({ answer: z.string() }),
    },
    async (input) => {
        const allPages = await getAllPagesData(input.uid);
        const allNotes = await getAllNotesData(input.uid);

        if (!allPages.length && !allNotes.length) {
            return { answer: "Lo siento, no hay contenido de páginas o notas para responder tu pregunta." };
        }

        let combinedContext = "Context:\n";
        allPages.forEach(page => {
            combinedContext += `\n--- Page: ${page.title} ---\n${page.llmInputText}\n`;
        });

        allNotes.forEach(note => {
            combinedContext += `\n--- Note: ${note.title} ---\n${note.llmInputText}\n`;
        });

        const llmResponse = await ai.generate({
            prompt: `Based in the next context, answer the question.\n\n${combinedContext}\n\nQuestion: ${input.question}`,
            config: {
                temperature: 0.1,
            },
        });

        return { answer: llmResponse.text };
    }
);

export const composeFlow = defineFlow(
    {
        name: 'compose',
        inputSchema: z.object({ question: z.string(), uid: z.string(), pageId: z.string().optional().nullable() }),
        outputSchema: z.object({ answer: z.string(), title: z.string().optional() }), // title debe ser opcional
    },
    async (input) => {
        const uid = input.uid;
        const allPages = await getAllPagesData(uid);
        const allNotes = await getAllNotesData(uid);

        let combinedContext = "Context:\n";
        allPages.forEach(page => {
            if (page.parent) {
                combinedContext += `\n--- As sub page of: ${page.parent} ---\n`;
            }
            combinedContext += `\n--- Page: ${page.title} ---\n${page.llmInputText}\n`;
        });

        allNotes.forEach(note => {
            combinedContext += `\n--- Note: ${note.title} ---\n${note.llmInputText}\n`;
        });

        if (input.pageId) {
            if (allPages.empty && input.pageId === uid) {
                combinedContext += `\n--- Esta será la página de inicio de la aplicación ---\n`;
            } else {
                combinedContext += `\n--- IMPORTANT: The answer should be added to this page: ${input.pageId} ---`;
            }
        }

        combinedContext += `\n--- IMPORTANT: Consider create mermaid diagrams adding in the code with \`\`\`mermaid`;
        combinedContext += `\n--- IMPORTANT: To link a pages use markdown format adding # and pageId to the current URL`;
        combinedContext += `\n--- IMPORTANT: Response should be in spanish`;
        combinedContext += `\n--- IMPORTANT: Never use \`\`\`markdown in the response`;

        const llmResponse = await ai.generate({
            prompt: `Based in the next context, create content to fulfill the requirement .\n\n${combinedContext}\n\nRequirement: ${input.question}`,
            config: {
                temperature: 0.4,
            },
        });

        if (!input.pageId) {
            const titleResponse = await ai.generate({ // Renombrado 'title' a 'titleResponse' para evitar confusión
                prompt: `Crear un título corto para esta respuesta. Devolver sólo el título.\n\n${llmResponse.text}`,
                config: {
                    temperature: 0.1,
                },
            });
            return { answer: llmResponse.text, title: titleResponse.text };
        }

        return { answer: llmResponse.text }; // title es opcional y será undefined
    }
);

export const editFlow = defineFlow(
    {
        name: 'edit',
        inputSchema: z.object({ question: z.string(), uid: z.string(), pageId: z.string() }), // pageId es requerido para editar
        outputSchema: z.object({ answer: z.string() }),
    },
    async (input) => {
        const uid = input.uid; // Obtener el UID

        const pageToEdit = await getPageById(input.pageId, uid);
        if (!pageToEdit) {
            throw new Error(`Page with ID ${input.pageId} not found or user not authorized for editing.`);
        }

        let combinedContext = "Context (other relevant user content):\n";
        const otherPages = await getAllPagesData(uid);
        otherPages.forEach(page => {
            if (page.id !== input.pageId) { // Excluir la página que se está editando del contexto general
                if (page.parent) {
                    combinedContext += `\n--- As sub page of: ${page.parent} ---\n`;
                }
                combinedContext += `\n--- Page: ${page.title} ---\n${page.llmInputText}\n`;
            }
        });

        const userNotes = await getAllNotesData(uid);
        userNotes.forEach(note => {
            combinedContext += `\n--- Note: ${note.title} ---\n${note.llmInputText}\n`;
        });

        let llmResponse;
        if (pageToEdit.type === 'swagger') {
            llmResponse = await ai.generate({
                prompt: `Editar este swagger y devolver SÓLO el JSON con la modificaciones solicitadas en el Requerimiento (sin incluir razonamientos).\n\nSwagger content:\n${pageToEdit.content}\n\nRequerimiento: ${input.question}`,
                config: {
                    temperature: 0.1,
                },
            });
        } else {
            combinedContext += `\n\n--- IMPORTANT INSTRUCTIONS FOR EDITING ---`;
            combinedContext += `\n--- IMPORTANT: Consider create mermaid diagrams adding in the code with \`\`\`mermaid`;
            combinedContext += `\n--- IMPORTANT: To link a pages use markdown format adding # and pageId to the current URL`;
            combinedContext += `\n--- IMPORTANT: Response should be in spanish`;
            combinedContext += `\n--- IMPORTANT: You are editing the page titled "${pageToEdit.title}". Return only the full, new content for this page.`;

            const currentPageContent = pageToEdit.llmInputText || pageToEdit.content || ""; // Asegurar que hay contenido

            llmResponse = await ai.generate({
                prompt: `Based on the provided context and the current content of the page you are editing, modify it to fulfill the requirement. \n\n${combinedContext}\n\nCurrent content of the page "${pageToEdit.title}" (ID: ${input.pageId}):\n${currentPageContent}\n\nRequirement: ${input.question}`,
                config: {
                    temperature: 0.4,
                },
            });
        }

        return { answer: llmResponse.text };
    }
);