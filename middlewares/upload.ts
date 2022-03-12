/*
Created by: Henrique Emanoel Viana
Githu: https://github.com/hviana
Page: https://sites.google.com/site/henriqueemanoelviana
cel: +55 (41) 99999-4664
*/

import {
  crypto,
  ensureDir,
  ensureDirSync,
  join,
  move,
  MultipartReader,
  readerFromStreamReader,
  SEP,
} from "../deps.ts";
import { Context, NextFunc } from "../server.ts";
interface UploadOptions {
  path?: string;
  extensions?: Array<string>;
  maxSizeBytes?: number;
  maxFileSizeBytes?: number;
  saveFile?: boolean;
  readFile?: boolean;
  useCurrentDir?: boolean;
}

const defaultUploadOptions: UploadOptions = {
  path: "uploads",
  extensions: [],
  maxSizeBytes: Number.MAX_SAFE_INTEGER,
  maxFileSizeBytes: Number.MAX_SAFE_INTEGER,
  saveFile: true,
  readFile: false,
  useCurrentDir: true,
};

const enc = new TextEncoder();

export function upload(
  options: UploadOptions = defaultUploadOptions,
) {
  const mergedOptions = { ...defaultUploadOptions, ...options };
  const {
    path,
    extensions,
    maxSizeBytes,
    maxFileSizeBytes,
    saveFile,
    readFile,
    useCurrentDir,
  } = mergedOptions;
  ensureDirSync(join(Deno.cwd(), "temp_uploads"));
  return async (ctx: Context, next: NextFunc) => {
    if (
      parseInt(ctx.req.headers.get("content-length")!) > maxSizeBytes!
    ) {
      throw new Error(
        `Maximum total upload size exceeded, size: ${
          ctx.req.headers.get("content-length")
        } bytes, maximum: ${maxSizeBytes} bytes. `,
      );
    }
    const boundaryRegex = /^multipart\/form-data;\sboundary=(?<boundary>.*)$/;
    let match: RegExpMatchArray | null;
    if (
      ctx.req.headers.get("content-type") &&
      (match = ctx.req.headers.get("content-type")!.match(
        boundaryRegex,
      ))
    ) {
      const formBoundary: string = match.groups!.boundary;
      const mr = new MultipartReader(
        readerFromStreamReader(ctx.req.body!.getReader()),
        formBoundary,
      );
      const form = await mr.readForm(0);
      const res: any = {};
      const entries: any = Array.from(form.entries());
      let validations = "";
      for (const item of entries) {
        const values: any = [].concat(item[1]);
        for (const val of values) {
          if (val.filename !== undefined) {
            if (extensions!.length > 0) {
              const ext = val.filename.split(".").pop();
              if (!extensions!.includes(ext)) {
                validations +=
                  `The file extension is not allowed (${ext} in ${val.filename}), allowed extensions: ${extensions}. `;
              }
            }
            if (val.size > maxFileSizeBytes!) {
              validations +=
                `Maximum file upload size exceeded, file: ${val.filename}, size: ${val.size} bytes, maximum: ${maxFileSizeBytes} bytes. `;
            }
          }
        }
      }
      if (validations != "") {
        await form.removeAll();
        throw new Error(validations);
      }
      for (const item of entries) {
        const formField: any = item[0];
        const filesData: any = [].concat(item[1]);
        for (const fileData of filesData) {
          if (fileData.tempfile !== undefined) {
            const resData = fileData;
            if (readFile) {
              resData["data"] = await Deno.readFile(resData["tempfile"]);
            }
            if (saveFile) {
              let uploadPath = path;
              const d = new Date();
              const uuid = join(
                d.getFullYear().toString(),
                (d.getMonth() + 1).toString(),
                d.getDate().toString(),
                d.getHours().toString(),
                d.getMinutes().toString(),
                d.getSeconds().toString(),
                crypto.randomUUID(),
              );
              uploadPath = join(path!, uuid);
              let fullPath = uploadPath;
              if (useCurrentDir) {
                fullPath = join(Deno.cwd(), fullPath!);
              }
              await ensureDir(fullPath!);
              await move(
                fileData.tempfile,
                join(fullPath!, fileData.filename),
              );
              delete resData["tempfile"];
              resData["id"] = uuid.replace(/\\/g, "/");
              resData["url"] = encodeURI(
                join(uploadPath!, fileData.filename).replace(/\\/g, "/"),
              );
              resData["uri"] = join(fullPath!, fileData.filename);
            } else {
              const tempFileName = resData.tempfile.split(SEP).pop();
              const pathTempFile = join(
                Deno.cwd(),
                "temp_uploads",
                tempFileName,
              );
              await move(
                resData.tempfile,
                pathTempFile,
              );
              resData.tempfile = pathTempFile;
            }
            if (res[formField] !== undefined) {
              if (Array.isArray(res[formField])) {
                res[formField].push(resData);
              } else {
                res[formField] = [res[formField], resData];
              }
            } else {
              res[formField] = resData;
            }
          }
        }
      }
      ctx.extra.uploadedFiles = res;
    } else {
      throw new Error(
        'Invalid upload data, request must contains a body with form "multipart/form-data", and inputs with type="file". ',
      );
    }
    await next();
  };
}
export function preUploadValidate(
  extensions: Array<string> = [],
  maxSizeBytes: number = Number.MAX_SAFE_INTEGER,
  maxFileSizeBytes: number = Number.MAX_SAFE_INTEGER,
) {
  return async (ctx: Context, next: NextFunc) => {
    const jsonData = (await ctx.req.json())["value"];
    let totalBytes = 0;
    let validations = "";
    for (const iName in jsonData) {
      const files: any = [].concat(jsonData[iName]);
      for (const file of files) {
        totalBytes += jsonData[iName].size;
        if (file.size > maxFileSizeBytes) {
          validations +=
            `Maximum file upload size exceeded, file: ${file.name}, size: ${file.size} bytes, maximum: ${maxFileSizeBytes} bytes. `;
        }
        if (!extensions.includes(file.name.split(".").pop())) {
          validations += `The file extension is not allowed (${
            file.name.split(".").pop()
          } in ${file.name}), allowed extensions: ${extensions}. `;
        }
      }
    }
    if (totalBytes > maxSizeBytes) {
      validations +=
        `Maximum total upload size exceeded, size: ${totalBytes} bytes, maximum: ${maxSizeBytes} bytes. `;
    }
    if (validations != "") {
      throw new Error(validations);
    }
    await next();
  };
}
