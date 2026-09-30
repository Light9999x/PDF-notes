// A rejected snapshot is not a failed disk write and must never be retried as
// an unguarded merge of a previously constructed operation batch.
export class BatchRejectedError extends Error {}
