import express from 'express';
import cors from 'cors';
import { runFlow } from '@genkit-ai/flow';
import { summarizePageFlow, answerQuestionFlow, composeFlow, editFlow } from './src/llmService.js';
import { validateToken } from "./src/firebaseService.js";

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const getParam = (req, paramName, bodyName = paramName) => {
    return req.query[paramName] || (req.body && req.body[bodyName]);
};

const validateFirestoreToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Intento de acceso sin token o con formato incorrecto.');
        return res.status(401).send({ error: 'No autorizado. Token no proporcionado o con formato incorrecto.' });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
        console.warn('Intento de acceso con token vacío después de "Bearer ".');
        return res.status(401).send({ error: 'No autorizado. El token está vacío.' });
    }

    req.user = await validateToken(token)
    next()
};
app.use(validateFirestoreToken);

app.all('/summarize', async (req, res, next) => { // Usamos .all para aceptar GET o POST
    try {
        const pageId = getParam(req, 'pageId');
        if (!pageId) {
            return res.status(400).send({ error: 'El parámetro pageId es requerido.' });
        }

        const result = await runFlow(summarizePageFlow, { pageId, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /summarize:', error);
        // Pasamos el error al manejador de errores global de Express
        next(error);
    }
});

app.all('/ask', async (req, res, next) => {
    try {
        const question = getParam(req, 'question');
        if (!question) {
            return res.status(400).send({ error: 'El parámetro question es requerido.' });
        }

        const result = await runFlow(answerQuestionFlow, { question, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /ask:', error);
        next(error);
    }
});

app.all('/compose', async (req, res, next) => {
    try {
        const question = getParam(req, 'question');
        if (!question) {
            return res.status(400).send({ error: 'El parámetro question es requerido.' });
        }

        const pageId = getParam(req, 'page_id', 'page_id') || null;

        const result = await runFlow(composeFlow, { question, pageId, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /compose:', error);
        next(error);
    }
});

app.all('/edit', async (req, res, next) => {
    try {
        console.log(req)
        const question = getParam(req, 'question');
        if (!question) {
            return res.status(400).send({ error: 'El parámetro question es requerido.' });
        }

        const pageId = getParam(req, 'page_id', 'page_id');
        if (!pageId) {
            return res.status(400).send({ error: 'El parámetro page_id es requerido.' });
        }

        const result = await runFlow(editFlow, { question, pageId, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /edit:', error);
        next(error);
    }
});

app.use((err, req, res, next) => {
    console.error('Error no manejado:', err.stack || err);
    res.status(500).send({
        error: 'Error interno del servidor al procesar la solicitud.',
        details: err.message || 'Ocurrió un error desconocido.'
    });
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});