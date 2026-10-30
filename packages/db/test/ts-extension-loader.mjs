const extensionless = /^(?:\.|\.\.)\//;

export async function resolve(specifier, context, nextResolve) {
  if (!extensionless.test(specifier) || pathHasSuffix(specifier)) {
    return nextResolve(specifier, context);
  }

  try {
    return await nextResolve(`${specifier}.ts`, context);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return nextResolve(specifier, context);
  }
}

function pathHasSuffix(specifier) {
  return /\.[a-zA-Z0-9]+$/.test(specifier);
}
