// SheetJS expands a compressed workbook into a large in-memory object graph.
// Keep that expansion to one dataset at a time for this API process.
let tail: Promise<void> = Promise.resolve();

export async function serializeExcelParse<T>(parse: () => T): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return parse();
  } finally {
    release();
  }
}
