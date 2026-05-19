// Chill recipe ingredient status
// Shows every recipe ingredient with a green check if it is in the user's fridge
// and a red cross if it is still missing.

(function () {
  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^а-яa-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getIngredientTokens(ingredient) {
    const normalized = normalizeText(ingredient);
    const tokens = normalized
      .split(' ')
      .filter(token => token.length >= 3)
      .map(token => token.slice(0, Math.min(5, token.length)));

    const synonyms = [];

    if (normalized.includes('кур')) synonyms.push('кур');
    if (normalized.includes('яй')) synonyms.push('яйц');
    if (normalized.includes('мол')) synonyms.push('молок');
    if (normalized.includes('сыр')) synonyms.push('сыр');
    if (normalized.includes('твор')) synonyms.push('твор');
    if (normalized.includes('йог')) synonyms.push('йогур');
    if (normalized.includes('карто')) synonyms.push('карт', 'карто');
    if (normalized.includes('помид') || normalized.includes('томат')) synonyms.push('помид', 'томат');
    if (normalized.includes('макарон') || normalized.includes('паста')) synonyms.push('макар', 'паст');
    if (normalized.includes('рис')) synonyms.push('рис');
    if (normalized.includes('греч')) synonyms.push('греч');
    if (normalized.includes('говяд')) synonyms.push('говяд');
    if (normalized.includes('свин')) synonyms.push('свин');
    if (normalized.includes('фарш')) synonyms.push('фарш');
    if (normalized.includes('рыб')) synonyms.push('рыб');
    if (normalized.includes('огур')) synonyms.push('огур');
    if (normalized.includes('морков')) synonyms.push('морк');
    if (normalized.includes('лук')) synonyms.push('лук');
    if (normalized.includes('перец')) synonyms.push('перец');
    if (normalized.includes('гриб')) synonyms.push('гриб');
    if (normalized.includes('хлеб')) synonyms.push('хлеб');
    if (normalized.includes('яблок')) synonyms.push('яблок');
    if (normalized.includes('банан')) synonyms.push('банан');

    return [...new Set([...tokens, ...synonyms])];
  }

  function ingredientExistsInFridge(ingredient) {
    const names = Array.isArray(products)
      ? products.map(product => normalizeText(product.name))
      : [];

    if (names.length === 0) return false;

    const ingredientText = normalizeText(ingredient);
    const tokens = getIngredientTokens(ingredient);

    return names.some(name => {
      if (!name) return false;
      if (name.includes(ingredientText) || ingredientText.includes(name)) return true;
      return tokens.some(token => name.includes(token));
    });
  }

  function getActualMissingIngredients(recipe) {
    return (recipe.ingredients || []).filter(ingredient => !ingredientExistsInFridge(ingredient));
  }

  function ensureRecipeStatusStyles() {
    if (document.getElementById('recipe-ingredient-status-styles')) return;

    const style = document.createElement('style');
    style.id = 'recipe-ingredient-status-styles';
    style.textContent = `
      .ingredient-status-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.35rem;
        height: 1.35rem;
        margin-right: .45rem;
        border-radius: 50%;
        font-size: .78rem;
        font-weight: 900;
        line-height: 1;
        flex: 0 0 auto;
      }

      .ingredient.has .ingredient-status-icon {
        background: rgba(76, 175, 80, .14);
        color: #2e7d32;
      }

      .ingredient.miss .ingredient-status-icon {
        background: rgba(244, 67, 54, .13);
        color: #c62828;
      }

      .ingredient-name {
        flex: 1;
      }

      .ingredient.has .ingredient-name {
        color: var(--text, #1a2217);
        font-weight: 700;
      }

      .ingredient.miss .ingredient-name {
        color: var(--text-muted, #6b7a67);
      }
    `;

    document.head.appendChild(style);
  }

  window.renderRecipes = function (matched) {
    ensureRecipeStatusStyles();

    const container = document.getElementById('recipes-result');
    if (!container) return;

    if (!matched || matched.length === 0) {
      container.innerHTML = activeDiet === 'all'
        ? '<div class="empty-state">Не нашлось рецептов. Добавь больше продуктов!</div>'
        : '<div class="empty-state">Нет рецептов для выбранного фильтра. Попробуй другой.</div>';
      return;
    }

    container.innerHTML = `<div class="recipes-grid">${matched.map(recipe => {
      const liked = recipeLikes[recipe.name];
      const tags = [];
      const diet = Array.isArray(recipe.diet) ? recipe.diet : [];
      const actualMissing = getActualMissingIngredients(recipe);

      if (recipe.isUrgent) tags.push('<span class="recipe-tag urgent">🔥 Срочный</span>');
      if (diet.includes('quick') || recipe.time <= 30) tags.push(`<span class="recipe-tag">⚡ ${recipe.time} мин</span>`);
      if (diet.includes('vegetarian')) tags.push('<span class="recipe-tag">🥦 Вегетарианское</span>');
      if (diet.includes('glutenfree')) tags.push('<span class="recipe-tag">🌾 Без глютена</span>');

      return `
        <div class="recipe-card">
          <div class="recipe-header">
            <span class="recipe-emoji">${recipe.emoji || '🍽️'}</span>
            <h3 class="recipe-name">${escHtml(recipe.name)}</h3>
            <button class="btn-like ${liked ? 'liked' : ''}" onclick="toggleLike('${escHtml(recipe.name)}')" title="${liked ? 'Убрать лайк' : 'Нравится'}">
              ${liked ? '❤️' : '🤍'}
            </button>
          </div>

          ${tags.length ? `<div class="recipe-meta">${tags.join('')}</div>` : ''}

          <div class="recipe-ingredients">
            ${(recipe.ingredients || []).map(ingredient => {
              const has = ingredientExistsInFridge(ingredient);
              return `<div class="ingredient ${has ? 'has' : 'miss'}">
                <span class="ingredient-status-icon">${has ? '✓' : '✕'}</span>
                <span class="ingredient-name">${escHtml(ingredient)}</span>
                ${!has ? `<button class="add-to-list" onclick="addMissing('${escHtml(ingredient)}')">+ в список</button>` : ''}
              </div>`;
            }).join('')}
          </div>

          ${actualMissing.length > 0 ? `
            <div class="recipe-footer">
              <button class="btn btn-outline btn-sm" onclick='addAllMissing(${JSON.stringify(actualMissing)})'>
                Добавить всё недостающее
              </button>
            </div>` : ''}
        </div>`;
    }).join('')}</div>`;
  };
})();
