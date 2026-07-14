export type FileStorageErrorResponse = {
  status: 410 | 502 | 503;
  code: "FILE_NOT_FOUND" | "STORAGE_BACKEND_UNAVAILABLE" | "STORAGE_TEMPORARY_ERROR";
  error: string;
};

export function classifyFileStorageError(
  error: unknown
): FileStorageErrorResponse {
  const code = error instanceof Error ? error.message : "";
  if (code === "FILE_NOT_FOUND") {
    return {
      status: 410,
      code: "FILE_NOT_FOUND",
      error: "원본 파일을 찾을 수 없습니다."
    };
  }
  if (code === "STORAGE_BACKEND_UNAVAILABLE") {
    return {
      status: 503,
      code: "STORAGE_BACKEND_UNAVAILABLE",
      error: "파일 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해주세요."
    };
  }
  return {
    status: 502,
    code: "STORAGE_TEMPORARY_ERROR",
    error: "파일 저장소와 통신하지 못했습니다. 잠시 후 다시 시도해주세요."
  };
}
