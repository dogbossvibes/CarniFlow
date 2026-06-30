import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { emitQuickAddArticle } from '@/features/tracking/quickAddArticleBus';

// Unsichtbare Ziel-Route für den iOS-Kurzbefehl (anyvo://track/quick-add-article).
// Löst den „Schnell-Gegenstand" im laufenden Lege-Screen aus und kehrt sofort
// zurück. Rendert nichts — minimaler Übergang, die Aufnahme läuft weiter.
export default function QuickAddArticleScreen() {
  const router = useRouter();
  useEffect(() => {
    emitQuickAddArticle();
    if (router.canGoBack()) router.back();
    else router.replace('/track' as never);
  }, [router]);
  return null;
}
