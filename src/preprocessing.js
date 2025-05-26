export function preprocessContentForLLM(data) {
    const contentType = data.type || "markdown";
    const rawContent = data.content || "";
    const title = data.title || "Nota";
    const pageId = data.id || "N/A";

    let processedText = `Título de la Página: ${title}\nID de Página: ${pageId}\nTipo: ${contentType}\n\nContenido:\n`;

    if (contentType === "markdown") {
        const textContent = rawContent || "";
        processedText += textContent.replace(/\n\s*\n/g, '\n').trim();

    } else if (contentType === "swagger") {
        try {
            const parsedSpec = JSON.parse(rawContent);
            processedText += JSON.stringify(parsedSpec, null, 2);
        } catch (e) {
            processedText += rawContent;
        }
    } else if (contentType === "mermaid") {
        processedText += "Diagrama Mermaid (código):\n";
        processedText += rawContent;
    } else {
        processedText += rawContent;
    }

    return processedText.trim();
}