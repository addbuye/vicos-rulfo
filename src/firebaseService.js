import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';

import {preprocessContentForLLM} from './preprocessing.js';

let app;
try {
    app = initializeApp();
} catch (error) {
    console.error('Error inicializando Firebase Admin SDK:', error);
}

const auth = getAuth(app);
const db = getFirestore(app);

export async function validateToken(idToken) {
    try {
        return await auth.verifyIdToken(idToken);
    } catch (error) {
        console.error('Error durante la validación del token de Firebase:', error);
        if (error.code === 'auth/id-token-expired') {
            throw new Error('No autorizado. Token expirado.')
        }
        if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-revoked') {
            throw new Error('No autorizado. Token inválido.')
        }
        throw new Error('Error interno del servidor al validar el token.')
    }
}

export async function getAllPagesData(uid) {
    if (!uid) throw new Error("UID is required to fetch page.");
    try {
        const docs = await db.collection('pages').where('authorId', '==', uid).get();
        if (docs.empty) {
            console.log('No se encontraron páginas.');
            return [];
        }

        const allPages = [];
        docs.forEach(doc => {
            const pageData = { id: doc.id, ...doc.data() };
            const llmInputText = preprocessContentForLLM(pageData);
            allPages.push({
                id: doc.id,
                title: pageData.title || 'Sin título',
                type: pageData.type || 'markdown',
                parent: pageData.parent,
                llmInputText: llmInputText,
            });
        });
        return allPages;
    } catch (error) {
        console.error('Error obteniendo páginas de Firestore:', error);
        throw error;
    }
}

export async function getAllNotesData(uid) {
    if (!uid) throw new Error("UID is required to fetch page.");
    try {
        const docs = await db.collection('notes').where('authorId', '==', uid).get();
        if (docs.empty) {
            console.log('No se encontraron notas.');
            return [];
        }

        const allNotes = [];
        docs.forEach(doc => {
            const pageData = { id: doc.id, ...doc.data() };
            const llmInputText = preprocessContentForLLM(pageData); // Preprocesa aquí
            allNotes.push({
                id: doc.id,
                title: pageData.title || 'Sin título',
                llmInputText: llmInputText,
            });
        });
        return allNotes;
    } catch (error) {
        console.error('Error obteniendo páginas de Firestore:', error);
        throw error;
    }
}

export async function getPageDataById(pageId, uid) {
    if (!uid) throw new Error("UID is required to fetch page.");
    try {
        const page = await db.collection('pages').doc( pageId).get();

        if (!page.exists) {
            console.warn(`Página con ID "${pageId}" no encontrada.`);
            return null;
        }
        const pageData = { id: page.id, ...page.data() };
        if (pageData.authorId !== uid) {
            console.warn(`User ${uid} attempted to access page ${pageId} owned by ${pageData.uid}`);
            return null;
        }
        const llmInputText = preprocessContentForLLM(pageData);
        return {
            id: page.id,
            title: pageData.title || 'Sin título',
            type: pageData.type || 'markdown',
            parent: pageData.parent,
            llmInputText: llmInputText,
        };
    } catch (error) {
        console.error(`Error obteniendo página ${pageId} de Firestore:`, error);
        throw error;
    }
}


export async function getPageById(pageId) {
    if (!uid) throw new Error("UID is required to fetch page.");
    try {
        const page = await db.collection('pages').doc( pageId).get();

        if (!page.exists) {
            console.warn(`Página con ID "${pageId}" no encontrada.`);
            return null;
        }

        return page.data();
    } catch (error) {
        console.error(`Error obteniendo página ${pageId} de Firestore:`, error);
        throw error;
    }
}