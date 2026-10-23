import { readFileSync } from 'fs';
it('loads root polyfills before importing the authenticated live provider', () => {
 const source = readFileSync('app/_layout.tsx', 'utf8');
 const providerImport = source.indexOf("import { LiveShareProvider }");
 for (const dependency of ["import 'react-native-get-random-values'", "import 'react-native-url-polyfill/auto'", "import '@/lib/crypto-polyfill'"]) {
  expect(source.indexOf(dependency)).toBeGreaterThanOrEqual(0);
  expect(providerImport).toBeGreaterThan(source.indexOf(dependency));
 }
 expect(source.indexOf('<LiveShareProvider>')).toBeGreaterThan(source.indexOf('<SessionProvider>'));
});
