// Chill profile UI

(function () {
  if (!window.chillSupabase) return;

  const spamProtectionScript = document.createElement('script');
  spamProtectionScript.src = 'supabase/spam-protection.js';
  document.head.appendChild(spamProtectionScript);

  const authModalScript = document.createElement('script');
  authModalScript.src = 'supabase/auth-modal.js';
  document.head.appendChild(authModalScript);

  const barcodeScript = document.createElement('script');
  barcodeScript.src = 'supabase/barcode-scanner.js';
  document.head.appendChild(barcodeScript);

  const recipesScript = document.createElement('script');
  recipesScript.src = 'supabase/recipes-catalog.js';
  document.head.appendChild(recipesScript);

  const api = window.chillSupabase;

  function ensureProfileCard() {
    if (document.getElementById('profile-card')) return;

    const authSection = document.getElementById('auth');

    const profile = document.createElement('div');
    profile.id = 'profile-card';
    profile.className = 'profile-card';
    profile.style.display = 'none';

    profile.innerHTML = `
      <div class="profile-avatar-wrap">
        <div class="profile-avatar" id="profile-avatar">👤</div>
      </div>

      <div class="profile-content">
        <div class="profile-heading-row">
          <div>
            <h3 id="profile-name">Пользователь Chill</h3>
            <p id="profile-email">email@example.com</p>
          </div>
          <span class="profile-plan-badge" id="profile-plan-badge">Пробный период</span>
        </div>

        <div class="profile-stats">
          <div class="profile-stat">
            <span class="profile-stat-value" id="profile-products-count">0</span>
            <span class="profile-stat-label">Продуктов</span>
          </div>

          <div class="profile-stat">
            <span class="profile-stat-value" id="profile-shopping-count">0</span>
            <span class="profile-stat-label">Покупок</span>
          </div>
        </div>

        <p class="profile-subscription-text" id="profile-subscription-text">
          7 дней бесплатно, затем нужен Pro.
        </p>

        <div class="profile-actions">
          <button class="btn btn-primary" id="profile-buy-pro-btn">Купить Pro</button>
          <button class="btn btn-outline" id="profile-refresh-btn">Обновить</button>
        </div>
      </div>
    `;

    authSection.appendChild(profile);

    document.getElementById('profile-refresh-btn').addEventListener('click', async () => {
      if (window.chillSpamProtection && !window.chillSpamProtection.allowWrite('обновление профиля')) return;
      await renderProfile();
      showToast('Профиль обновлён');
    });

    document.getElementById('profile-buy-pro-btn').addEventListener('click', async () => {
      if (window.chillSpamProtection && !window.chillSpamProtection.allowWrite('открытие подписки')) return;

      if (window.chillPaywall) {
        window.chillPaywall.showPaywall();
        return;
      }

      showToast('Paywall ещё загружается, попробуйте через пару секунд');
    });
  }

  async function renderSubscriptionState() {
    const badge = document.getElementById('profile-plan-badge');
    const text = document.getElementById('profile-subscription-text');
    const proBtn = document.getElementById('profile-buy-pro-btn');

    if (!badge || !text || !proBtn) return;

    const subscription = await api.getSubscription();

    if (!subscription) {
      badge.textContent = 'Бесплатно';
      badge.className = 'profile-plan-badge profile-plan-free';
      text.textContent = 'Войдите в аккаунт, чтобы получить 7 дней Pro бесплатно.';
      proBtn.textContent = 'Купить Pro';
      return;
    }

    if (subscription.status === 'active') {
      badge.textContent = 'Pro активен';
      badge.className = 'profile-plan-badge profile-plan-pro';
      text.textContent = 'Все функции сайта доступны.';
      proBtn.textContent = 'Управлять Pro';
      return;
    }

    if (subscription.status === 'trialing') {
      const daysLeft = api.getTrialDaysLeft(subscription);
      badge.textContent = 'Пробный период';
      badge.className = 'profile-plan-badge profile-plan-trial';
      text.textContent = `Осталось ${daysLeft} дн. Затем нужен Pro.`;
      proBtn.textContent = 'Купить Pro';
      return;
    }

    badge.textContent = 'Период закончился';
    badge.className = 'profile-plan-badge profile-plan-expired';
    text.textContent = 'Для работы сайта нужна подписка Pro.';
    proBtn.textContent = 'Купить Pro';
  }

  async function renderProfile() {
    ensureProfileCard();

    const session = await api.getSession();
    const profileCard = document.getElementById('profile-card');

    if (!session?.user) {
      profileCard.style.display = 'none';
      return;
    }

    const profile = await api.getProfile();

    profileCard.style.display = 'flex';

    document.getElementById('profile-name').textContent =
      profile?.full_name || 'Пользователь Chill';

    document.getElementById('profile-email').textContent =
      profile?.email || session.user.email;

    document.getElementById('profile-products-count').textContent =
      Array.isArray(products) ? products.length : 0;

    document.getElementById('profile-shopping-count').textContent =
      Array.isArray(shopping) ? shopping.length : 0;

    const avatar = document.getElementById('profile-avatar');

    if (profile?.full_name) {
      avatar.textContent = profile.full_name
        .split(' ')
        .map(x => x[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    } else {
      avatar.textContent = '👤';
    }

    await renderSubscriptionState();
  }

  window.renderChillProfile = renderProfile;

  document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(renderProfile, 1000);
  });
})();
