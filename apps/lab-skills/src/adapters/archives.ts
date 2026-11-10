import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { extract } from "tar-stream";
import { Effect, Layer } from "effect";
import { Archives, type ArchiveFile } from "../services.js";
import { problem } from "../error.js";

export const archiveLayer = Layer.succeed(Archives, {
  unpack: Effect.fn("Archives.unpack")((data) =>
    Effect.tryPromise({
      try: (signal) =>
        new Promise<ReadonlyArray<ArchiveFile>>((resolve, reject) => {
          const parser = extract(),
            unzip = createGunzip(),
            input = Readable.from([data]);
          const files: ArchiveFile[] = [];
          let total = 0;
          const fail = (error: unknown) => {
            input.destroy();
            unzip.destroy();
            parser.destroy();
            reject(error);
          };
          signal.addEventListener(
            "abort",
            () => fail(new Error("Interrupted")),
            { once: true },
          );
          input.on("error", fail);
          unzip.on("error", fail);
          parser.on("error", fail);
          parser.on("entry", (header, stream, next) => {
            const chunks: Uint8Array[] = [];
            stream.on("data", (chunk: Buffer) => {
              total += chunk.length;
              if (total > 256 * 1024 * 1024) {
                fail(new Error("Expanded archive exceeds 256 MiB"));
                return;
              }
              chunks.push(chunk);
            });
            stream.on("error", fail);
            stream.on("end", () => {
              files.push({
                path: header.name,
                kind: header.type ?? "file",
                bytes: Buffer.concat(chunks),
              });
              next();
            });
            stream.resume();
          });
          parser.on("finish", () => resolve(files));
          // oxlint-disable-next-line effecttsgo/unnecessary-pipe-chain -- Each native stream pipe changes the destination stream.
          input.pipe(unzip).pipe(parser);
        }),
      catch: () =>
        problem("DOWNLOAD_FAILED", "Cannot decode pinned tar.gz archive", 1),
    }),
  ),
});
