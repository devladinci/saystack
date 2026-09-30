interface IBlock {
  kind: "code" | "table" | "list" | "heading" | "paragraph";
  start: number;
  lines: string[];
}

interface IProps {
  text: string;
}

interface IInlineProps {
  text: string;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}/;
const LIST_ITEM = /^\s*[-*]\s+/;
const HEADING = /^#{1,6}\s+/;

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

    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        body.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push({ kind: "code", start, lines: body });
      index += 1;
      continue;
    }

    const kind = TABLE_ROW.test(line) ? "table" : LIST_ITEM.test(line) ? "list" : HEADING.test(line) ? "heading" : "paragraph";
    const body: string[] = [];

    while (index < lines.length && (lines[index] ?? "").trim() !== "") {
      const next = lines[index] ?? "";
      const isSameKind =
        kind === "table" ? TABLE_ROW.test(next) : kind === "list" ? LIST_ITEM.test(next) : !TABLE_ROW.test(next) && !next.trim().startsWith("```");

      if (!isSameKind || (kind === "heading" && body.length > 0)) {
        break;
      }

      body.push(next);
      index += 1;
    }

    blocks.push({ kind, start, lines: body });
  }

  return blocks;
}

function Inline({ text }: IInlineProps) {
  const parts = Array.from(text.matchAll(/\*\*([^*]+)\*\*|`([^`]+)`|([^*`]+|[*`])/g));

  return (
    <>
      {parts.map((part) => {
        if (part[1] !== undefined) {
          return <strong key={part.index}>{part[1]}</strong>;
        }

        if (part[2] !== undefined) {
          return <code key={part.index}>{part[2]}</code>;
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
            <pre key={block.start}>
              <code>{block.lines.join("\n")}</code>
            </pre>
          );
        }

        if (block.kind === "table") {
          const [head = "", ...rest] = block.lines.filter((row) => !TABLE_RULE.test(row));

          return (
            <table key={block.start}>
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
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={block.start}>
              {block.lines.map((item) => (
                <li key={item}>
                  <Inline text={item.replace(LIST_ITEM, "")} />
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === "heading") {
          return (
            <h3 key={block.start}>
              <Inline text={(block.lines[0] ?? "").replace(HEADING, "")} />
            </h3>
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
