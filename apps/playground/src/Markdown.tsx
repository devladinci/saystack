interface IBlock {
  kind: "code" | "table" | "paragraph";
  start: number;
  lines: string[];
  language: string;
}

interface IProps {
  text: string;
}

interface IInlineProps {
  text: string;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}/;
const FENCE = "```";

function toBlocks(text: string): IBlock[] {
  const lines = text.split("\n");
  const blocks: IBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const start = index;

    if (line.trim().startsWith(FENCE)) {
      const body: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith(FENCE)) {
        body.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push({ kind: "code", start, lines: body, language: line.trim().slice(FENCE.length) });
      index += 1;
      continue;
    }

    const kind = TABLE_ROW.test(line) ? "table" : "paragraph";
    const body: string[] = [];

    while (index < lines.length && (lines[index] ?? "").trim() !== "") {
      const next = lines[index] ?? "";

      if ((kind === "table") !== TABLE_ROW.test(next) || next.trim().startsWith(FENCE)) {
        break;
      }

      body.push(next);
      index += 1;
    }

    blocks.push({ kind, start, lines: body, language: "" });
  }

  return blocks;
}

function Inline({ text }: IInlineProps) {
  const parts = Array.from(text.matchAll(/\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|([^*`]+|[*`])/g));

  return (
    <>
      {parts.map((part) => {
        if (part[1] !== undefined) {
          return <strong key={part.index}>{part[1]}</strong>;
        }

        if (part[2] !== undefined) {
          return <em key={part.index}>{part[2]}</em>;
        }

        if (part[3] !== undefined) {
          return <code key={part.index}>{part[3]}</code>;
        }

        return <span key={part.index}>{part[0]}</span>;
      })}
    </>
  );
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

export function Markdown({ text }: IProps) {
  return (
    <>
      {toBlocks(text).map((block) => {
        if (block.kind === "code") {
          return (
            <div key={block.start} className="code" data-read-as-block>
              <div className="code-head">{block.language}</div>
              <pre>
                <code>{block.lines.join("\n")}</code>
              </pre>
            </div>
          );
        }

        if (block.kind === "table") {
          const [head = "", ...rest] = block.lines.filter((row) => !TABLE_RULE.test(row));

          return (
            <div key={block.start} className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {cells(head).map((cell) => (
                      <th key={cell}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rest.map((row) => (
                    <tr key={row}>
                      {cells(row).map((cell, column) => (
                        <td key={`${column}:${cell}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={block.start}>
            <Inline text={block.lines.join(" ")} />
          </p>
        );
      })}
    </>
  );
}
