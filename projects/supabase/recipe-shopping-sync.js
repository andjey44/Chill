// Chill recipe -> shopping cloud sync
// Saves missing recipe ingredients to Supabase shopping_items instead of only localStorage.

(function () {
  if (!window.chillSupabase) return;

  const api = window.chillSupabase;

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  async function hasSession() {
    const session = await api.getSession();
    return Boolean(session?.user);
  }

  async function guardAction(type, label) {
    const guard = window.chillSpamProtection;
    if (!guard) return true;

    if (type === 'destructive') return await guard.allowDestructive(label);
    if (type === 'auth') return await guard.allowAuth(label);
    return await guard.allowWrite(label);
  }

  async function syncShoppingFromCloud() {
    const cloudShopping = await api.getShoppingItems();

    shopping = Array.isArray(cloudShopping)
      ? cloudShopping.map(item => ({
          id: item.id,
          name: item.name,
          bought: Boolean(item.bought)
        }))
      : [];

    renderShopping();

    if (window.renderChillProfile) {
      await window.renderChillProfile();
    }
  }

  async function addCloudShoppingItem(name) {
    const exists = shopping.some(item => normalize(item.name) === normalize(name));

    if (exists) return false;

    await api.addShoppingItem({
      name,
      category: 'other',
      quantity: '1',
      bought: false
    });

    return true;
  }

  window.addMissing = async function (name) {
    if (!(await guardAction('write', 'добавление ингредиента из рецепта'))) return;

    if (!(await hasSession())) {
      showToast('Войдите в аккаунт, чтобы сохранить список покупок.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    if (shopping.some(item => normalize(item.name) === normalize(name))) {
      showToast(`${name} уже в списке покупок`);
      return;
    }

    await addCloudShoppingItem(name);
    await syncShoppingFromCloud();

    showToast(`${name} добавлен в список покупок`);
  };

  window.addAllMissing = async function (names) {
    if (!(await guardAction('write', 'добавление всех ингредиентов из рецепта'))) return;

    if (!(await hasSession())) {
      showToast('Войдите в аккаунт, чтобы сохранить список покупок.');
      if (window.openAuthModal) window.openAuthModal('login');
      return;
    }

    const safeNames = Array.isArray(names) ? names : [];
    let added = 0;

    for (const name of safeNames) {
      const wasAdded = await addCloudShoppingItem(name);
      if (wasAdded) added++;
    }

    await syncShoppingFromCloud();

    showToast(added > 0 ? `Добавлено ${added} позиц. в список покупок` : 'Всё уже в списке');
  };
})();
