import i18n from '@/i18n/config';
/** A delayed/failed locale initialization must never break the root import. */
export function registerGroupResources(namespace: string, resources: Record<string, Record<string, string>>) {
  const install = () => {
    if (!i18n.isInitialized) return;
    i18n.off('initialized', install);
    for (const [language, messages] of Object.entries(resources)) {
      i18n.addResourceBundle(language, namespace, messages, true, false);
    }
  };
  if (i18n.isInitialized) install();
  else i18n.on('initialized', install);
}
