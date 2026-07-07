function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeDetoxConfig(base, override) {
  return Object.fromEntries(
    Object.entries({...base, ...override}).map(([key, value]) => [
      key,
      isObject(base[key]) && isObject(override[key])
        ? mergeDetoxConfig(base[key], override[key])
        : value,
    ]),
  );
}

exports.mergeDetoxConfig = mergeDetoxConfig;
