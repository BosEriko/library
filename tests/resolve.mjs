const root = new URL("../", import.meta.url);

async function resolvePackage(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND" || specifier.startsWith(".")) {
      throw error;
    }

    return nextResolve(`${specifier}.js`, context);
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return {
      url: new URL(`${specifier.slice(2)}.ts`, root).href,
      format: "module-typescript",
      shortCircuit: true,
    };
  }

  const resolved = await resolvePackage(specifier, context, nextResolve);

  if (resolved.url.endsWith(".ts") && !resolved.url.includes("/node_modules/")) {
    return { ...resolved, format: "module-typescript" };
  }

  return resolved;
}
