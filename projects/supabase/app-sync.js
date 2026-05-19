// Chill Supabase synchronization layer

(function () {
  if (!window.chillSupabase) {
    console.error('Supabase client not found');
    return;
  }

  // Load profile UI layer dynamically
  const profileScript = document.createElement('script');
  profileScript.src = 'supabase/profile-ui.js';
  document.head.appendChild(profileScript);

  // Load paywall layer dynamically
  const paywallScript = document.createElement('script');
  paywallScript.src = 'supabase/paywall.js';
  document.head.appendChild(paywallScript);

  const supabaseApi = window.chillSupabase;

  function spamGuard(type, label) {
    const guard = window.chillSpamProtection;
    if (!guard) return true;

    if (type === 'auth') return guard.allowAuth(label);
    if (type === 'destructive') return guard.allowDestructive(label);
    return guard.allowWrite(label);
  }

  async function hasPremiumAccessOrShowPaywall() {
    const session = await supabaseApi.getSession();

    if (!session?.user) return true;

    if (!window.chillPaywall) return true;

    const result = await window.chillPaywall.refreshPaywall();

    if (!result.hasAccess) {
      window.chillPaywall.showPaywall();
      showToast('Пробный период закончился. Активируйте Premium.');
      return false;
    }

    return true;
  }

  function showAuthError(error, fallbackMessage) {
    console.error(error);

    const msg = String(error?.message || '').toLowerCase();

    if (msg.includes('email not confirmed') || msg.includes('confirm') || msg.includes('confirmed')) {
      showToast('Email не подтверждён. Я могу отключить подтверждение или подтвердить аккаунт в Supabase.');
      return;
    }

    if (msg.includes('invalid login credentials')) {
      showToast('Неверный email или пароль');
      return;
    }

    if (msg.includes('password')) {
      showToast('Пароль должен быть минимум 6 символов');
      return;
    }

    if (msg.includes('already') || msg.includes('registered')) {
      showToast('Такой email уже зарегистрирован');
      return;
    }

    if (msg.includes('email')) {
      showToast('Проверьте правильность email');
      return;
    }

    showToast(fallbackMessage);
  }

  function resetPersonalAnalytics() {
    eaten = [];
    wasted = [];
  }

  async function syncProductEventsFromCloud() {
    const events = await supabaseApi.getProductEvents();

    eaten = [];
    wasted = [];

    if (!Array.isArray(events)) return;

    events.forEach(event => {
      const item = {
        id: event.id,
        name: event.product_name,
        category: event.category || 'other',
        price: event.price || 0,
        eatenAt: event.created_at,
        wastedAt: event.created_at
      };

      if (event.event_type === 'eaten') eaten.push(item);
      if (event.event_type === 'wasted') wasted.push(item);
    });
  }

  async function refreshAuthUI() {
    const session = await supabaseApi.getSession();

    const authStatus = document.getElementById('auth-status');
    const authForm = document.getElementById('auth-form');
    const logoutBtn = document.getElementById('auth-logout');

    if (session?.user) {
      authStatus.textContent = `Вы вошли как ${session.user.email}. Данные синхронизируются через Supabase ☁️`;
      if (authForm) authForm.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
      if (window.refreshAuthModalVisibility) window.refreshAuthModalVisibility(true);

      await syncProductsFromCloud();
      await syncShoppingFromCloud();
      await syncProductEventsFromCloud();

      render();

      if (window.renderChillProfile) await window.renderChillProfile();
      if (window.chillPaywall) await window.chillPaywall.refreshPaywall();
    } else {
      authStatus.textContent = 'Гостевой режим: данные хранятся только в этом браузере.';
      if (authForm) authForm.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (window.refreshAuthModalVisibility) window.refreshAuthModalVisibility(false);

      products = [];
      shopping = [];
      resetPersonalAnalytics();
      render();

      const profileCard = document.getElementById('profile-card');
      if (profileCard) profileCard.style.display = 'none';

      if (window.chillPaywall) await window.chillPaywall.refreshPaywall();
    }
  }

  async function syncProductsFromCloud() {
    const cloudProducts = await supabaseApi.getProducts();

    products = Array.isArray(cloudProducts)
      ? cloudProducts.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          expiryDate: p.expiry_date,
          price: p.price,
          addedAt: p.created_at
        }))
      : [];
  }

  async function syncShoppingFromCloud() {
    const cloudShopping = await supabaseApi.getShoppingItems();

    shopping = Array.isArray(cloudShopping)
      ? cloudShopping.map(item => ({
          id: item.id,
          name: item.name,
          bought: Boolean(item.bought)
        }))
      : [];
  }

  window.signUpChill = async function () {
    if (!spamGuard('auth', 'регистрация')) return;

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();

    if (!email || !password) {
      showToast('Введите email и пароль');
      return;
    }

    const { data, error } = await supabaseApi.signUp(email, password);

    if (error) {
      showAuthError(error, 'Ошибка регистрации');
      return;
    }

    showToast(data?.session ? 'Регистрация успешна, вы вошли в аккаунт 🚀' : 'Регистрация успешна! Теперь войдите в аккаунт.');
    if (window.closeAuthModal) window.closeAuthModal();
    await refreshAuthUI();
  };

  window.signInChill = async function () {
    if (!spamGuard('auth', 'вход')) return;

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();

    if (!email || !password) {
      showToast('Введите email и пароль');
      return;
    }

    const { error } = await supabaseApi.signIn(email, password);

    if (error) {
      showAuthError(error, 'Неверный email или пароль');
      return;
    }

    showToast('Вход выполнен 🚀');
    if (window.closeAuthModal) window.closeAuthModal();
    await refreshAuthUI();
  };

  window.signOutChill = async function () {
    if (!spamGuard('auth', 'выход')) return;

    await supabaseApi.signOut();
    products = [];
    shopping = [];
    resetPersonalAnalytics();
    showToast('Вы вышли из аккаунта');
    await refreshAuthUI();
  };

  window.addProduct = async function () {
    if (!spamGuard('write', 'добавление продукта')) return;

    const session = await supabaseApi.getSession();

    if (!session?.user) {
      showToast('Войдите в аккаунт, чтобы добавлять продукты и вести аналитику.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    if (!(await hasPremiumAccessOrShowPaywall())) return;

    const name = document.getElementById('add-name').value.trim();
    const category = document.getElementById('add-category').value;
    const expiryDate = document.getElementById('add-expiry').value;
    const priceRaw = document.getElementById('add-price').value;
    const price = priceRaw ? Number(priceRaw) : 0;

    if (!name || !expiryDate) {
      showToast('Заполни название и срок годности');
      return;
    }

    await supabaseApi.addProduct({ name, category, expiry_date: expiryDate, price });

    await syncProductsFromCloud();
    await syncProductEventsFromCloud();
    closeModal();
    render();

    if (window.renderChillProfile) await window.renderChillProfile();

    showToast(`✓ ${name} сохранён в облаке`);
  };

  window.markEaten = async function (id) {
    if (!spamGuard('write', 'отметка продукта')) return;

    const session = await supabaseApi.getSession();

    if (!session?.user) {
      showToast('Войдите в аккаунт, чтобы сохранять личную аналитику.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    if (!(await hasPremiumAccessOrShowPaywall())) return;

    const product = products.find(x => x.id === id);
    if (!product) return;

    await supabaseApi.markProductEaten(product);

    if (!shopping.find(s => s.name.toLowerCase() === product.name.toLowerCase())) {
      await supabaseApi.addShoppingItem({ name: product.name, category: product.category || 'other', quantity: '1' });
      await syncShoppingFromCloud();
    }

    await syncProductsFromCloud();
    await syncProductEventsFromCloud();
    render();

    if (window.renderChillProfile) await window.renderChillProfile();

    showToast(`✓ ${product.name} съеден и больше не вернётся в холодильник`);
  };

  window.addManualShopping = async function () {
    if (!spamGuard('write', 'добавление покупки')) return;

    const session = await supabaseApi.getSession();

    if (!session?.user) {
      showToast('Войдите в аккаунт, чтобы вести личный список покупок.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    if (!(await hasPremiumAccessOrShowPaywall())) return;

    const input = document.getElementById('shopping-input');
    const name = input.value.trim();

    if (!name) return;

    if (shopping.find(s => s.name.toLowerCase() === name.toLowerCase())) {
      showToast('Уже есть в списке');
      return;
    }

    await supabaseApi.addShoppingItem({ name, category: 'other', quantity: '1', bought: false });

    input.value = '';

    await syncShoppingFromCloud();
    renderShopping();

    if (window.renderChillProfile) await window.renderChillProfile();

    showToast('Товар сохранён в Supabase');
  };

  window.toggleBought = async function (id) {
    if (!spamGuard('write', 'изменение покупки')) return;

    const session = await supabaseApi.getSession();

    if (!session?.user) {
      showToast('Войдите в аккаунт, чтобы менять список покупок.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    if (!(await hasPremiumAccessOrShowPaywall())) return;

    const item = shopping.find(s => s.id === id);
    if (!item) return;

    await supabaseApi.updateShoppingItemBought(id, !item.bought);
    await syncShoppingFromCloud();
    renderShopping();
  };

  window.removeShoppingItem = async function (id) {
    if (!spamGuard('destructive', 'удаление покупки')) return;

    const session = await supabaseApi.getSession();

    if (!session?.user) {
      showToast('Войдите в аккаунт, чтобы удалять покупки.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    if (!(await hasPremiumAccessOrShowPaywall())) return;

    await supabaseApi.deleteShoppingItem(id);
    await syncShoppingFromCloud();
    renderShopping();

    if (window.renderChillProfile) await window.renderChillProfile();

    showToast('Товар полностью удалён');
  };

  window.clearBought = async function () {
    if (!spamGuard('destructive', 'очистка покупок')) return;

    const session = await supabaseApi.getSession();

    if (!session?.user) {
      showToast('Войдите в аккаунт, чтобы очищать список покупок.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    if (!(await hasPremiumAccessOrShowPaywall())) return;

    const boughtCount = shopping.filter(s => s.bought).length;

    if (boughtCount === 0) {
      showToast('Нет отмеченных купленных товаров');
      return;
    }

    await supabaseApi.clearBoughtShoppingItems();
    await syncShoppingFromCloud();
    renderShopping();

    if (window.renderChillProfile) await window.renderChillProfile();

    showToast(`Удалено купленных товаров: ${boughtCount}`);
  };

  document.addEventListener('DOMContentLoaded', async () => {
    products = [];
    shopping = [];
    resetPersonalAnalytics();
    render();
    setTimeout(refreshAuthUI, 300);
  });
})();
