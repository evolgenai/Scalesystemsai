import { executeCodeInSandbox } from "@/lib/agents/codeSandbox";

export type DirectCodePayload = {
  language: "python" | "javascript";
  code: string;
  reason: string;
};

const FENCE_RE = /```(?:(python|py|javascript|js|typescript|ts))?\s*([\s\S]*?)```/i;

/**
 * Detect explicit code-execution / print intents and extract a sandbox payload.
 * Bypasses the multi-agent planner when matched.
 */
export function detectDirectCodeExecution(
  objective: string
): DirectCodePayload | null {
  const trimmed = objective.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(FENCE_RE);
  if (fenced?.[2]?.trim()) {
    const langRaw = (fenced[1] || "").toLowerCase();
    const language: "python" | "javascript" =
      langRaw === "python" || langRaw === "py" || /\bprint\s*\(/.test(fenced[2])
        ? "python"
        : "javascript";
    return {
      language,
      code: fenced[2].trim(),
      reason: "fenced-code-block",
    };
  }

  const wantsPrint =
    /\bprint\s*\(/i.test(trimmed) ||
    /\bconsole\.log\s*\(/i.test(trimmed) ||
    /\bput the answer in a variable\b/i.test(trimmed) ||
    /\boutput\s+print\b/i.test(trimmed) ||
    (/\bvariable\s+called\b/i.test(trimmed) && /\bprint\b/i.test(trimmed));

  if (!wantsPrint) return null;

  // "3+3" / "what is 12 * 4" style math + variable assignment intent
  const mathMatch = trimmed.match(
    /(-?\d+(?:\.\d+)?)\s*([+\-*/x×])\s*(-?\d+(?:\.\d+)?)/i
  );
  const varMatch = trimmed.match(
    /variable\s+called\s+[`'"]?([A-Za-z_][\w]*)[`'"]?/i
  );
  const varName = varMatch?.[1] || "answer";

  if (mathMatch) {
    const a = mathMatch[1]!;
    const opRaw = mathMatch[2]!;
    const b = mathMatch[3]!;
    const op = opRaw === "x" || opRaw === "×" ? "*" : opRaw;
    const preferPython =
      /\bprint\s*\(/i.test(trimmed) ||
      /\bpython\b/i.test(trimmed) ||
      !/\bconsole\.log\b/i.test(trimmed);

    if (preferPython) {
      return {
        language: "python",
        code: `${varName} = ${a} ${op} ${b}\nprint(${varName})`,
        reason: "nl-math-print",
      };
    }

    return {
      language: "javascript",
      code: `const ${varName} = ${a} ${op} ${b};\nconsole.log(${varName});`,
      reason: "nl-math-console",
    };
  }

  // Multi-line script body embedded after a NL preface
  // e.g. "run this:\nanswer = 3+3\nprint(answer)"
  const scriptBody = trimmed.match(
    /(?:^|\n)\s*((?:[A-Za-z_][\w]*\s*=\s*.+\n)+print\s*\([^)]+\))/i
  );
  if (scriptBody?.[1]?.trim()) {
    return {
      language: "python",
      code: scriptBody[1].trim(),
      reason: "embedded-python-script",
    };
  }

  // Inline print(...) / console.log(...) already present
  const inlinePrint = trimmed.match(/print\s*\(([^)]+)\)/i);
  if (inlinePrint) {
    // Prefer a fuller snippet when assignment + print appear in the same prompt.
    const assign = trimmed.match(
      /([A-Za-z_][\w]*)\s*=\s*([^,\n]+)[\s\S]*?\bprint\s*\(\s*\1\s*\)/i
    );
    if (assign) {
      return {
        language: "python",
        code: `${assign[1]} = ${assign[2]!.trim()}\nprint(${assign[1]})`,
        reason: "assign-and-print",
      };
    }
    return {
      language: "python",
      code: `print(${inlinePrint[1]})`,
      reason: "inline-print",
    };
  }

  const inlineLog = trimmed.match(/console\.log\s*\(([^)]+)\)/i);
  if (inlineLog) {
    return {
      language: "javascript",
      code: `console.log(${inlineLog[1]});`,
      reason: "inline-console",
    };
  }

  return null;
}

export async function runDirectCodeExecution(
  objective: string,
  signal?: AbortSignal
): Promise<{
  matched: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  language?: "python" | "javascript";
  code?: string;
}> {
  const detected = detectDirectCodeExecution(objective);
  if (!detected) {
    return { matched: false, stdout: "", stderr: "", exitCode: 1 };
  }

  const result = await executeCodeInSandbox(detected.code, detected.language, {
    signal,
  });

  return {
    matched: true,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    exitCode: result.exitCode,
    language: detected.language,
    code: detected.code,
  };
}
