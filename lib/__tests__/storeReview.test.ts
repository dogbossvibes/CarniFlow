import { openStoreReviewPage, storeReviewUrls } from '../storeReview';

describe('storeReviewUrls', () => {
  it('iOS: App-Store-App zuerst, dann Web, beide mit write-review', () => {
    expect(storeReviewUrls('ios')).toEqual([
      'itms-apps://apps.apple.com/app/id6776362904?action=write-review',
      'https://apps.apple.com/app/id6776362904?action=write-review',
    ]);
  });

  it('Android: Play-Store-App zuerst, dann Web', () => {
    expect(storeReviewUrls('android')).toEqual([
      'market://details?id=com.anyvo.app',
      'https://play.google.com/store/apps/details?id=com.anyvo.app',
    ]);
  });

  it('andere Plattformen: keine URL', () => {
    expect(storeReviewUrls('web')).toEqual([]);
  });
});

describe('openStoreReviewPage', () => {
  it('öffnet die erste URL, wenn sie aufgeht', async () => {
    const openURL = jest.fn().mockResolvedValue(true);
    await expect(openStoreReviewPage('ios', { openURL })).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/^itms-apps:/));
  });

  it('fällt auf die Web-URL zurück, wenn die Store-App nicht aufgeht', async () => {
    const openURL = jest.fn().mockRejectedValueOnce(new Error('no app')).mockResolvedValueOnce(true);
    await expect(openStoreReviewPage('android', { openURL })).resolves.toBe(true);
    expect(openURL).toHaveBeenNthCalledWith(2, 'https://play.google.com/store/apps/details?id=com.anyvo.app');
  });

  it('meldet false, wenn keine URL aufgeht', async () => {
    const openURL = jest.fn().mockRejectedValue(new Error('nope'));
    await expect(openStoreReviewPage('ios', { openURL })).resolves.toBe(false);
    expect(openURL).toHaveBeenCalledTimes(2);
  });

  it('meldet false auf Plattformen ohne Store', async () => {
    const openURL = jest.fn();
    await expect(openStoreReviewPage('web', { openURL })).resolves.toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });
});
