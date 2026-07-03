import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

// Stateless text extraction for an uploaded JD/resume file. Nothing is
// persisted — the extracted text is returned straight to the browser,
// which holds it in memory/sessionStorage for the practice session.
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return new Response("Missing 'file'", { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  try {
    let text: string;
    if (name.endsWith(".pdf")) {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      text = result.text;
    } else if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString("utf-8");
    }

    return Response.json({ text: text.trim() });
  } catch (error) {
    return new Response(
      `Failed to parse document: ${error instanceof Error ? error.message : String(error)}`,
      { status: 422 },
    );
  }
}
