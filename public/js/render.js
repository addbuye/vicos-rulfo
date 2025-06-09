(() => {

  // --- Configuration ---
  let firebaseConfig = null;
  let currentUser = null;
  let auth = null;
  let db = null;
  let storage = null;

  // --- Constants ---
  const AI_SERVICE_URL = "http://localhost:8080";

  // --- Firebase Initialization ---
  async function initializeFirebase() {
    try {
      console.log('Fetching Firebase config...');
      const response = await fetch('/config');
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }
      const config = await response.json();
      console.log('Received config:', {
        hasConfig: !!config,
        hasFirebaseConfig: !!config.firebaseConfig,
        configKeys: config.firebaseConfig ? Object.keys(config.firebaseConfig) : []
      });
      
      firebaseConfig = config.firebaseConfig;
      
      if (!firebaseConfig || !firebaseConfig.apiKey) {
        throw new Error('Invalid Firebase configuration');
      }

      let app;
      if (!firebase.apps.length) {
        console.log('Initializing Firebase app...');
        app = firebase.initializeApp(firebaseConfig);
        console.log('Firebase inicializado correctamente');
      } else {
        console.log('Using existing Firebase app');
        app = firebase.app();
      }

      // Initialize Firebase services
      auth = firebase.auth();
      db = firebase.firestore();
      storage = firebase.storage();

      // Forzar login anónimo primero
      try {
        console.log('Attempting anonymous login...');
        const userCredential = await auth.signInAnonymously();
        currentUser = userCredential.user;
        console.log('Login anónimo exitoso:', currentUser.uid);
      } catch (authError) {
        console.error('Error en login anónimo:', authError);
        showError('Error al iniciar sesión: ' + authError.message, 'danger');
        throw authError;
      }

      return { app, auth, db, storage };
    } catch (error) {
      console.error('Error inicializando Firebase:', error);
      showError('Error al inicializar Firebase: ' + error.message, 'danger');
      throw error;
    }
  }

  // --- DOM Elements ---
  const contentDiv = document.getElementById('content');
  const authContainer = document.getElementById('auth-container');
  const navLinksList = document.getElementById('nav-links');
  const swaggerContainer = document.getElementById('swagger-container');
  const breadcrumbContainer = document.getElementById('breadcrumb-container');

  const pageEditorModalElement = document.getElementById('pageEditorModal');
  const pageEditorModal = new bootstrap.Modal(pageEditorModalElement);
  const pageEditorForm = document.getElementById('page-editor-form');
  const savePageButton = document.getElementById('save-page-button');
  const pageContentTextarea = document.getElementById('edit-page-content');

  const noteEditorModalElement = document.getElementById('noteEditorModal');
  const noteEditorModal = new bootstrap.Modal(noteEditorModalElement);
  const noteEditorForm = document.getElementById('note-editor-form');
  const saveNoteButton = document.getElementById('save-note-button');

  const searchInput = document.querySelector('#sidebar input[type="text"][placeholder="Search"]');

  const askAiFab = document.getElementById('ask-ai-fab'); // El botón flotante
  const askAiModalElement = document.getElementById('askAiModal');
  const askAiModal = new bootstrap.Modal(askAiModalElement);
  const askAiForm = document.getElementById('ask-ai-form');
  const aiQuestionInput = document.getElementById('ai-question');
  const aiModeSelect = document.getElementById('ai-mode');
  const submitAiQuestionButton = document.getElementById('submit-ai-question-btn');

  // --- State ---
  let currentPageData = null;
  let draggedElementId = null;

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      console.log('Starting application initialization...');
      const { app, auth, db, storage } = await initializeFirebase();
      
      // Luego inicializar el resto
      console.log('Initializing wiki...');
      await initializeWiki();
    } catch (error) {
      console.error('Error en inicialización:', error);
      showError('Error al inicializar la aplicación: ' + error.message, 'danger');
    }
  });

  /**
   * Auto-login function for development
   */
  async function autoLogin() {
    try {
      // Sign in anonymously
      await auth.signInAnonymously();
      console.log('Auto-logged in successfully');
    } catch (error) {
      console.error('Auto-login failed:', error);
    }
  }

  /**
   * Main initialization function.
   */
  function initializeWiki() {
    setupAuthListener();
    attachMainListeners();
    setupGlobalEventListeners();
    if (pageContentTextarea) { // <-- Attach paste listener here
      pageContentTextarea.addEventListener('paste', handlePasteImage);
    } else {
      console.warn("Page content textarea (#edit-page-content) not found. Image paste upload will not work.");
    }
  }

  // --- Authentication ---

  function setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      renderAuthUI();

      if (askAiFab) {
        askAiFab.style.display = currentUser ? 'block' : 'none';
      }
      if (currentPageData) {
        await loadPage(currentPageData.id);
        attachNavigationListeners()
      } else {
        await loadPage(window.location.hash.substring(1));
      }
      await setupNavigation();
      await loadNotes()
    });
  }

  function renderAuthUI() {
    const auxbarCollapse = document.getElementById('auxbarCollapse');
    const sidebarHeader = document.querySelector('#sidebar');
    const userMenu = document.getElementById('user-menu');

    if (currentUser) {
      authContainer.innerHTML = `
        <div class="user-container">
              <span class="user-name">
                    Hi! ${currentUser.displayName.split(' ')[0] || 'User'}
              </span>
        </div>
      `;

      auxbarCollapse.innerHTML = `
        <img src="${currentUser.photoURL || 'assets/default-avatar.png'}" alt="${currentUser.displayName}" class="user-avatar">
      `;

      userMenu.innerHTML = `
            <ul id="user-menu" class="list-unstyled components mb-3">
                <li>
                    <a href="#settings" data-page-id="swagger">
                        Settings
                    </a>
                </li>
                <li>
                    <a role="button" id="logout-btn">
                        Logout
                    </a>
                </li>
            </ul>
            <h2>Notes</h2>
        `

      const newNoteButton = document.createElement('button');
      newNoteButton.id = 'new-note-btn';
      newNoteButton.className = 'btn btn-light btn-sm w-100';
      newNoteButton.textContent = 'New note';
      userMenu.querySelector('h2').insertAdjacentElement('afterend', newNoteButton);

      if (sidebarHeader) {
        const existingPageButton = document.getElementById('new-root-page-btn');
        if (!existingPageButton) { // Evitar duplicados
          const newPageButton = document.createElement('button');
          newPageButton.id = 'new-root-page-btn';
          newPageButton.className = 'btn btn-dark btn-sm mb-3 w-100';
          newPageButton.textContent = 'New page';
          sidebarHeader.querySelector('#nav-links').insertAdjacentElement('afterend', newPageButton);
        }
      }
    } else {
      authContainer.innerHTML = `
        <div class="google-login-container">
          <span id="google-login-btn" class="google-login-btn">
            <img src="assets/google-icon.png" alt="Google logo" class="google-icon">
            <span>Sign in with Google</span>
          </span>
        </div>
      `;

      auxbarCollapse.innerHTML = `
        <i class="fa fa-bars"></i><span class="sr-only">Toggle Menu</span>
      `;

      userMenu.innerHTML = ""
    }
  }

  function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const allRootNavItems = navLinksList.querySelectorAll(':scope > li'); // Only direct children

    if (searchTerm === '') {
      navLinksList.querySelectorAll('li').forEach(li => {
        li.style.display = '';
        const nestedList = li.querySelector(':scope > ul.collapse');
        if (nestedList) {
           nestedList.classList.remove('show');
        }
      });
    } else {
      allRootNavItems.forEach(li => {
        filterNavItem(li, searchTerm);
      });
    }
  }

  function filterNavItem(liElement, searchTerm) {
    const anchor = liElement.querySelector(':scope > a');
    const title = anchor ? anchor.textContent.toLowerCase() : '';
    const nestedList = liElement.querySelector(':scope > ul.collapse');
    let hasMatchingChildren = false;

    if (nestedList) {
      Array.from(nestedList.children).forEach(childLi => {
        if (filterNavItem(childLi, searchTerm)) {
          hasMatchingChildren = true;
        }
      });
    }

    const currentItemMatches = title.includes(searchTerm);

    if (currentItemMatches || hasMatchingChildren) {
      liElement.style.display = ''; // Show the item
      if (hasMatchingChildren && nestedList) {
        nestedList.classList.add('show');
      }
      return true;
    } else {
      liElement.style.display = 'none'; // Hide the item
      return false;
    }
  }

  async function handleGoogleSignIn() {
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      showError("Authentication failed. Please try again.");
    }
  }

  async function handleSignOut() {
    try {
      await auth.signOut();
      // Auth state change listener handles UI update and reload
    } catch (error) {
      console.error("Sign Out Error:", error);
      showError("Failed to sign out.");
    }
  }

  // --- Data Fetching (Firestore) ---
  async function fetchRootPagesWithChildren() {
    if (!currentUser) return null;

    const snapshot = await db.collection('pages')
        .where('parent', '==', null)
        .where('authorId', '==', currentUser.uid)
        .orderBy('order', 'asc')
        .get();

    if (snapshot.empty) return null;

    const pagePromises = snapshot.docs.map(async (doc) => {
      const pageData = {id: doc.id, ...doc.data()};
      pageData.children = await fetchChildrenForPage(doc.id);
      return pageData;
    });

    return Promise.all(pagePromises);
  }

  async function fetchNotes() {
    if (!currentUser) return null

    const snapshot = await db.collection('notes')
        .where('authorId',  '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .get();

    if (snapshot.empty) return null;

    return snapshot.docs.map((doc) => {
      return {id: doc.id, ...doc.data()};
    });
  }

  async function fetchSiblings(parentId) {
    if (!parentId) return [];
    try {
      const snapshot = await db.collection('pages')
          .where('parent', '==', parentId)
          .orderBy('order', 'asc') // Ensure order
          .get();
      const siblings = [];
      snapshot.forEach(doc => {
        siblings.push({ id: doc.id, ...doc.data() });
      });
      return siblings;
    } catch (error) {
      console.error(`Error fetching siblings for parent ${parentId}:`, error);
      return [];
    }
  }

  async function fetchChildrenForPage(parentId) {
    try {
      const snapshot = await db.collection('pages')
          .where('parent', '==', parentId)
          .orderBy('order', 'asc') // Optional: order children if needed
          .get();

      if (snapshot.empty) return null;

      return snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

    } catch (error) {
      console.error(`Error fetching children for page ${parentId}:`, error);
      return null;
    }
  }

  async function fetchPageData(pageId) {
    if (!pageId) return null;
    try {
      const doc = await db.collection('pages').doc(pageId).get();
      if (doc.exists) {
        const children = await fetchChildrenForPage(pageId);
        return {id: doc.id, ...doc.data(), children };
      } else {
        console.warn(`Page document with ID "${pageId}" not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching page data for ID "${pageId}":`, error);
      throw error;
    }
  }

  // --- Navigation ---

  async function setupNavigation() {
    try {
      const rootPages = await fetchRootPagesWithChildren();
      if (rootPages) {
        renderNavigation(rootPages);
        attachNavigationListeners();
      } else {
        navLinksList.innerHTML = '<li>No pages found.</li>'
      }
    } catch (error) {
      console.error("Error setting up navigation:", error);
    }
  }

  function truncate(source, size) {
    return source.length > size ? source.slice(0, size - 1) + "…" : source;
  }

  function parseDate(timestamp) {
    if (!timestamp) return ""
    try {
      const now = new Date();
      const then = new Date(timestamp.seconds * 1000);

      const seconds = Math.round((now - then) / 1000);
      const minutes = Math.round(seconds / 60);
      const hours = Math.round(minutes / 60);
      const days = Math.round(hours / 24);

      if (seconds < 60) {
        return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
      } else if (minutes < 60) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      } else if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
      } else {
        return `${days} day${days !== 1 ? 's' : ''} ago`;
      }
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function loadNotes() {
    const notesList = document.getElementById('notes-list');
    notesList.innerHTML = '';
    try {
      const notes = await fetchNotes();

      if (notes && notes.length > 0) {
        notes.forEach(note => {
          const noteElementFragment = createNoteItemElement(note);
          notesList.appendChild(noteElementFragment);
        });
      } else {
        notesList.innerHTML = '<li class="list-group-item">No notes found.</li>';
      }
    } catch (error) {
      console.error("Error setting up navigation:", error);
    }
  }

  function createNoteItemElement(note) {
    const fragment = document.createDocumentFragment();
    const modalId = `note-modal-${note.id}`; // Ensure unique ID for modal

    const listItemLink = document.createElement('a');
    listItemLink.href = "#"; // Link is handled by modal toggle
    listItemLink.className = "list-group-item list-group-item-action py-3 lh-sm";
    listItemLink.dataset.bsToggle = "modal";
    listItemLink.dataset.bsTarget = `#${modalId}`; // Link to the modal via ID

    const divFlex = document.createElement('div');
    divFlex.className = "d-flex w-100 align-items-center justify-content-between";

    const strongTitle = document.createElement('strong');
    strongTitle.className = "mb-1";
    strongTitle.textContent = truncate(note.title, 40); // Use existing truncate

    divFlex.appendChild(strongTitle);

    const divContentPreview = document.createElement('div');
    divContentPreview.className = "col-10 mb-1 small";
    divContentPreview.textContent = truncate(note.content, 60); // Use existing truncate

    const smallDate = document.createElement('small');
    smallDate.className = "text-body-secondary";
    smallDate.textContent = parseDate(note.createdAt); // Use existing parseDate

    listItemLink.appendChild(divFlex);
    listItemLink.appendChild(divContentPreview);
    listItemLink.appendChild(smallDate);

    fragment.appendChild(listItemLink);

    const modalDiv = document.createElement('div');
    modalDiv.className = "modal fade text-dark";
    modalDiv.id = modalId; // Use the unique ID
    modalDiv.tabIndex = -1;
    modalDiv.setAttribute('aria-hidden', 'true');

    const modalDialog = document.createElement('div');
    modalDialog.className = "modal-dialog modal-xl"; // Consider modal-lg for more space if needed

    const modalContent = document.createElement('div');
    modalContent.className = "modal-content";

    const modalHeader = document.createElement('div');
    modalHeader.className = "modal-header";
    const modalTitle = document.createElement('h1');
    modalTitle.className = "modal-title fs-5";
    // modalTitle.id = `note-label-${note.id}`; // Optional ID for aria-labelledby
    modalTitle.textContent = note.title;
    const closeButton = document.createElement('button');
    closeButton.type = "button";
    closeButton.className = "btn-close";
    closeButton.dataset.bsDismiss = "modal";
    closeButton.setAttribute('aria-label', 'Close');
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);

    const modalBody = document.createElement('div');
    modalBody.className = "modal-body";
    try {
      switch (note.type) {
        case 'query':
          note.content = '```mysql' + note.content + '```'
          break;
      }
      modalBody.innerHTML = marked.parse(note.content || '');
    } catch (e) {
      console.error(`Error parsing markdown for note ${note.id}:`, e);
      modalBody.textContent = "Error displaying content.";
    }

    const modalFooter = document.createElement('div');
    modalFooter.className = "modal-footer";

    const deleteButton = document.createElement('button');
    deleteButton.type = "button";
    deleteButton.className = "btn btn-danger";
    deleteButton.innerHTML = '<i class="fa fa-trash"></i> Delete'; // Use innerHTML for icon
    deleteButton.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete the note "${note.title}"?`)) {
        handleDeleteNote(note.id)
            .then(() => {
              const modalInstance = bootstrap.Modal.getInstance(modalDiv);
              if (modalInstance) {
                modalInstance.hide();
              }
            })
            .catch(err => {
              console.error("Error during note deletion:", err);
              showError("Failed to delete note."); // Show error to user
            });
      }
    });

    const editButton = document.createElement('button');
    editButton.type = "button";
    editButton.className = "btn btn-primary";
    editButton.innerHTML = '<i class="fa fa-edit"></i> Edit'; // Use innerHTML for icon
    editButton.addEventListener('click', () => {
      const modalInstance = bootstrap.Modal.getInstance(modalDiv);
      if (modalInstance) {
        modalDiv.addEventListener('hidden.bs.modal', () => {
          openNoteEditor(note);
        }, { once: true });
        modalInstance.hide();
      } else {
        openNoteEditor(note);
      }
    });

    modalFooter.appendChild(deleteButton);
    modalFooter.appendChild(editButton);

    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modalDialog.appendChild(modalContent);
    modalDiv.appendChild(modalDialog);

    fragment.appendChild(modalDiv); // Add modal to fragment

    return fragment; // Return the fragment
  }

  function renderNavigation(pages, targetElement = navLinksList) {
    targetElement.innerHTML = pages.map(page => createNavItemHTML(page)).join('');
  }

  function createNavItemHTML(page) {
    const hasChildren = Array.isArray(page.children) && page.children.length > 0;

    return `
      <li draggable="true" data-page-id="${page.id}" data-page-order="${page.order || 0}" data-page-parent="${page.parent || ''}">
        <a
          ${hasChildren ? `data-bs-toggle="collapse" data-bs-target="#submenu-${page.id}" class="dropdown-toggle collapsed"` : ''}
          href="#${page.id}" data-page-id="${page.id}">
          ${page.title}
          ${page.type === 'swagger' ? '<span class="badge text-bg-success rounded-pill"><i class="fa fa-code"></i></span>' : ''}
          ${page.type === 'mermaid' ? '<span class="badge text-bg-info rounded-pill"><i class="fa fa-project-diagram"></i></span>' : ''}
        </a>
        <ul class="list-unstyled collapse" id="submenu-${page.id}">
          ${hasChildren ? page.children.map(child => createNavItemHTML(child)).join('') : ''}
        </ul>
      </li>
    `;
  }

  function attachNavigationListeners() {
    navLinksList.addEventListener('click', (e) => { // No need for async here
      const target = e.target;

      if (target.tagName === 'A' && target.dataset.pageId) {
        e.preventDefault();
        window.location.hash = target.dataset.pageId;
      }
    });

    if (currentUser) {
      navLinksList.addEventListener('dragstart', handleDragStart);
      navLinksList.addEventListener('dragover', handleDragOver);
      navLinksList.addEventListener('drop', handleDrop);
      navLinksList.addEventListener('dragend', handleDragEnd);
      navLinksList.addEventListener('dragenter', handleDragEnter);
      navLinksList.addEventListener('dragleave', handleDragLeave);
    }
  }

  function attachMainListeners() {
    const sidebarCollapseButton = document.getElementById('sidebarCollapse');
    const sidebarElement = document.getElementById('sidebar');

    sidebarCollapseButton.addEventListener('click', () => {
      sidebarElement.classList.toggle('active');
    });
    const auxCollapseButton = document.getElementById('auxbarCollapse');
    const auxElement = document.getElementById('auxbar');

    auxCollapseButton.addEventListener('click', () => {
      auxElement.classList.toggle('active');
    });
  }

  async function loadPage(pageId) {
    if (!pageId) {
      if (currentUser) {
        let page = await fetchPageData(currentUser.uid);
        if (!page) {
          await createHome()
          page = await fetchPageData(currentUser.uid);
        }
        currentPageData = page;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        try {
          if (!page.lastUpdated || page.lastUpdated.toDate() < today) {
            const aiResult = await askAiQuestion("qué tengo que hacer hoy", 'new_page');
            if (aiResult && aiResult.answer) {
              page.content = aiResult.answer;
              page.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
              await updatePage(currentUser.uid, { content: aiResult.answer, lastUpdated: page.lastUpdated });
            }
          }
          renderPageContent();
          renderEditControls();
          return;
        } catch (error) {
          console.error("Error loading home", error);
          renderError(`Failed to load home. ${error.message}`);
          return;
        }
      } else {
        renderWelcome()
        return;
      }
    }

    showLoadingIndicator();
    renderBreadcrumbs(null);
    swaggerContainer.style.display = 'none';
    contentDiv.style.display = 'block';
    renderPageControls([], null, null);

    try {
      const page = await fetchPageData(pageId);
      if (page) {
        currentPageData = page;
        const parentId = page.parent || null;
        let pagesForControls = [];

        if (parentId) {
          pagesForControls = await fetchSiblings(parentId);
        } else {
          if (!page.children) {
            page.children = await fetchChildrenForPage(page.id);
          }
          pagesForControls = page.children || [];
        }

        const ancestors = await fetchAncestors(page.id);
        renderBreadcrumbs(ancestors);

        renderPageContent();
        renderPageControls(pagesForControls, page.id, parentId);
        renderEditControls();
      } else {
        renderError(`Page with ID "${pageId}" not found.`);
        currentPageData = null;
        renderBreadcrumbs(null);
        renderPageControls([], null, null);
      }
    } catch (error) {
      console.error(`Error loading page "${pageId}":`, error);
      renderError(`Failed to load page "${pageId}". ${error.message}`);
      currentPageData = null;
      renderBreadcrumbs(null);
    }
  }

  function showLoadingIndicator() {
    const existingControls = document.getElementById('page-action-controls');
    if (existingControls) existingControls.remove();
    contentDiv.innerHTML = '<div class="loading">Loading...</div>';
  }

  function renderEditControls() {
    const existingControls = document.getElementById('page-action-controls');
    if (existingControls) existingControls.remove();

    if (currentUser && currentPageData) {
      const controlsDiv = document.createElement('div');
      controlsDiv.id = 'page-action-controls';
      controlsDiv.className = 'mt-2 text-end';
      controlsDiv.innerHTML = `
              <div class="dropdown">
                <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                  Actions
                </button>
                <ul class="dropdown-menu">
                  <li>
                    <a id="delete-page-btn" role="button" class="dropdown-item" data-page-id="${currentPageData.id}"><i class="fa fa-trash"></i> Delete Page</a>
                  </li>
                  <li>
                    <a id="edit-page-btn" role="button" class="dropdown-item" data-page-id="${currentPageData.id}">
                        <i class="fa fa-edit"></i> Edit Page
                    </a>
                  </li>
                  <li>
                    <a id="add-child-page-btn" role="button" class="dropdown-item" data-parent-id="${currentPageData.id}">
                        <i class="fa fa-plus"></i> Add Subpage
                    </a>
                  </li>
                  <li>
                    <a id="clone-page-btn" role="button" class="dropdown-item" data-parent-id="${currentPageData.id}">
                        <i class="fa fa-clone"></i> Clone
                    </a>
                  </li>
                </ul>
              </div>
          `;
      contentDiv.before(controlsDiv);
    }
  }

  function renderPageControls(pagesToShow, currentPageId, parentId) {
    let controlsContainer = document.getElementById('page-controls');

    if ((!pagesToShow || pagesToShow.length === 0) && !parentId) {
      if (controlsContainer) {
        controlsContainer.innerHTML = ''; // Clear it
        controlsContainer.style.display = 'none'; // Hide it
      }
      return;
    }

    if (!controlsContainer) {
      controlsContainer = document.createElement('div');
      controlsContainer.id = 'page-controls';
      breadcrumbContainer.parentNode.insertBefore(controlsContainer, breadcrumbContainer.nextSibling);
    }

    controlsContainer.innerHTML = '';
    controlsContainer.style.display = 'block';

    const list = document.createElement('ul');
    list.className = 'list-group list-group-horizontal d-flex justify-content-center';

    let listHtml = '';

    if (parentId) {
      listHtml += createPageControlItemHTML({ id: parentId, title: 'Home', type: 'home' }, currentPageId);
    }

    listHtml += pagesToShow
        .sort((a, b) => (a.order || 0) - (b.order || 0)) // Asegurar orden
        .map(page => createPageControlItemHTML(page, currentPageId)) // Pasar currentPageId
        .join('');

    list.innerHTML = listHtml;
    controlsContainer.appendChild(list);
  }

  function createPageControlItemHTML(page, currentPageId) {
    const isActive = page.id === currentPageId;
    var icon = ''
    switch (page.type) {
      case 'home':
        icon = 'fa fa-home'
        break;
      case 'markdown':
        icon = 'fa fa-file-invoice'
        break;
      case 'mermaid':
        icon = 'fa fa-project-diagram'
        break;
      case 'swagger':
        icon = 'fa fa-code'
        break;
      default:
        icon = 'fa fa-file-alt'
    }

    return `<li class="list-group-item ${isActive ? 'page-control-active' : ''}">
      <a href="#${page.id}"><i class="${icon}"></i> &nbsp; ${page.title}</a>
    </li>`;
  }

  function openPageEditor(pageToEdit = null, parentId = null, initialData = null, prompt = null) {
    pageEditorForm.reset();
    document.getElementById('edit-page-prompt').innerHTML = ""

    console.log(prompt)
    if (pageToEdit) {
      document.getElementById('pageEditorModalLabel').textContent = `Edit Page: ${pageToEdit.title}`;
      document.getElementById('page-id').value = pageToEdit.id || '';
      document.getElementById('edit-page-parent').value = pageToEdit.parent || '';
      document.getElementById('edit-page-order').value = pageToEdit.order || 0;
      document.getElementById('edit-page-title').value = pageToEdit.title || '';
      document.getElementById('edit-page-type').value = pageToEdit.type || 'markdown';
      document.getElementById('edit-page-content').value = pageToEdit.content || '';
      if (prompt) {
        const promptDiv = document.getElementById('edit-page-prompt')
        document.getElementById('edit-page-prompt').innerHTML = '<b>Based in your prompt:</b> ' + prompt;
        promptDiv.style.display = 'block';
      }
    } else {
      document.getElementById('page-id').value = '';
      document.getElementById('pageEditorModalLabel').textContent = 'Create New Page';
      document.getElementById('edit-page-parent').value = parentId || ''; // Set parent if provided

      if (initialData) {
        document.getElementById('edit-page-title').value = initialData.title || '';
        document.getElementById('edit-page-content').value = initialData.content || '';
        document.getElementById('edit-page-type').value = initialData.type || 'markdown';
        document.getElementById('edit-page-order').value = initialData.order !== undefined ? initialData.order : 0;
        if (initialData.title === '' && initialData.content) { // Specific for cloning
          document.getElementById('pageEditorModalLabel').textContent = 'Clone Page (New Title Required)';
        }
      }
    }

    pageEditorModal.show();
  }

  function handleClonePage() {
    if (!currentUser || !currentPageData) {
      showError("Cannot clone page: No current page data available or not logged in.", "warning");
      return;
    }

    const initialCloneData = {
      title: '',
      content: currentPageData.content || '',
      type: currentPageData.type || 'markdown',
      order: 0, // Default order for a new cloned page, user can adjust
    };

    const parentOfClone = currentPageData.parent || null;

    openPageEditor(null, parentOfClone, initialCloneData);
  }

  async function handleSavePage() {
    const pageId = document.getElementById('page-id').value;
    const title = document.getElementById('edit-page-title').value.trim();
    const type = document.getElementById('edit-page-type').value;
    const order = parseInt(document.getElementById('edit-page-order').value, 10) || 0;
    const content = document.getElementById('edit-page-content').value;
    let parentId = document.getElementById('edit-page-parent').value || null;

    if (!title) {
      showError("Title is required.");
      return;
    }

    if (currentPageData.parent) {
      parentId = currentPageData.parent
    }

    const pageData = {
      title,
      type,
      order,
      content,
      parent: parentId,
    };

    savePageButton.disabled = true;
    savePageButton.textContent = 'Saving...';

    try {
      if (pageId) {
        await updatePage(pageId, pageData);
        showError("Page updated successfully!", "success"); // Usa showError para mensajes de éxito también
        pageEditorModal.hide();
        await setupNavigation();
        await loadPage(pageId);
      } else {
        const newPageRef = await createPage(pageData);
        const newPageId = newPageRef.id;
        showError("Page created successfully!", "success");
        pageEditorModal.hide();
        await setupNavigation();
        window.location.hash = newPageId;
      }
    } catch (error) {
      console.error("Error saving page:", error);
      showError(`Error saving page: ${error.message}`);
    } finally {
      savePageButton.disabled = false;
      savePageButton.textContent = 'Save Changes';
    }
  }

  async function handleDeleteNote(id) {
    try {
      await deleteNote(id);
      await loadNotes();
      noteEditorModal.hide();
    } catch (error) {
      console.error("Error deleting page:", error);
      showError(`Error deleting page: ${error.message}`);
    }
  }

  async function handleDeletePage(pageId) {
    try {
      const children = await fetchChildrenForPage(pageId);
      if (children && children.length > 0) {
        const deletePromises = children.map(child => handleDeletePage(child.id));
        await Promise.all(deletePromises);
      }

      await deletePage(pageId);

      if (window.location.hash.substring(1) === pageId) {
        window.location.hash = "home";
      }
      await setupNavigation();
      showError("Page and its subpages deleted successfully.", "success");

    } catch (error) {
      console.error("Error deleting page:", error);
      showError(`Error deleting page: ${error.message}`);
    }
  }

  function openNoteEditor(noteToEdit = null, prompt = null) {
    noteEditorForm.reset();

    if (noteToEdit) {
      document.getElementById('noteEditorModalLabel').textContent = `Edit Note: ${noteToEdit.title}`;
      document.getElementById('note-id').value = noteToEdit.id;
      document.getElementById('edit-note-title').value = noteToEdit.title || '';
      document.getElementById('edit-note-type').value = noteToEdit.type || 'markdown';
      document.getElementById('edit-note-content').value = noteToEdit.content || '';
      if (prompt) {
        const promptDiv = document.getElementById('edit-note-prompt')
        document.getElementById('edit-note-prompt').innerHTML = '<b>Based in your prompt:</b> ' + prompt;
        promptDiv.style.display = 'block';
      }
    } else {
      document.getElementById('pageEditorModalLabel').textContent = 'Create New Page';
    }

    noteEditorModal.show();
  }

  async function handleSaveNote() {
    const id = document.getElementById('note-id').value.trim();
    const title = document.getElementById('edit-note-title').value.trim();
    const type = document.getElementById('edit-note-type').value;
    const content = document.getElementById('edit-note-content').value;

    if (!title) {
      showError("Title is required.");
      return;
    }

    const noteData = {
      id,
      title,
      type,
      content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    saveNoteButton.disabled = true;
    saveNoteButton.textContent = 'Saving...';

    try {
      if (noteData.id) {
        await updateNote(noteData.id, noteData);
        showError("Note updated successfully!", "success");
      } else {
        delete noteData.id;
        await createNote(noteData);
        showError("Note created successfully!", "success");
      }
      noteEditorModal.hide();
      await loadNotes()
    } catch (error) {
      console.error("Error saving note:", error);
      showError(`Error saving note: ${error.message}`);
    } finally {
      saveNoteButton.disabled = false;
      saveNoteButton.textContent = 'Save Changes';
    }
  }

  async function updateNote(noteId, data) {
    data.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('notes').doc(noteId).update(data);
  }

  async function deleteNote(noteId) {
    await db.collection('notes').doc(noteId).delete();
  }

  async function deletePage(pageId) {
    await db.collection('pages').doc(pageId).delete();
  }

  async function updatePage(pageId, data) {
    data.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('pages').doc(pageId).update(data);
  }

  async function createPage(data) {
    if (currentUser) {
      data.authorId = currentUser.uid;
    }

    return await db.collection('pages').add(data);
  }

  async function createHome() {
    console.log("Creating home")
    const homeRef = db.collection('pages').doc(currentUser.uid);
    homeRef.set({title: 'Home', content: "", authorId: currentUser.uid, type: 'markdown', order: 0, parent: null})
  }

  async function createNote(data) {
    if (currentUser) {
      data.authorId = currentUser.uid;
    }

    return await db.collection('notes').add(data);
  }

  function renderPageContent() {
    const page = currentPageData
    if (!page || !page.type) {
      console.error("Invalid page data in renderPageContent:", page);
      renderError("Could not render page: Invalid data.");
      return;
    }
    switch (page.type) {
      case 'markdown':
        renderMarkdownPage(page.content);
        break;
      case 'swagger':
        renderSwaggerSpec(page.content);
        break;
      case 'mermaid':
        swaggerContainer.style.display = 'none';
        contentDiv.style.display = 'block';
        content = "```mermaid \n\r" + page.content + "\n\r ```"
        contentDiv.innerHTML = marked.parse(content);
        renderMermaidDiagrams();
        break;
      default:
        console.warn(`Unknown page type "${page.type}". Rendering as Markdown.`);
        renderMarkdownPage(page.content || '');
    }
  }

  function renderMarkdownPage(markdownContent) {
    swaggerContainer.style.display = 'none';
    contentDiv.style.display = 'block';
    contentDiv.innerHTML = marked.parse(markdownContent || '');
    renderMermaidDiagrams();
    highlightCodeBlocks();
    addCopyButtonsToCodeBlocks();
  }

  function renderSwaggerSpec(spec) {
    contentDiv.style.display = 'none';
    swaggerContainer.style.display = 'block';
    swaggerContainer.innerHTML = ''; // Clear previous UI

    let parsedSpec;
    try {
      if (typeof spec === 'object' && spec !== null) {
        parsedSpec = spec;
      } else if (typeof spec === 'string') {
        try {
          parsedSpec = JSON.parse(spec);
        } catch (jsonError) {
          if (typeof jsyaml === 'undefined') {
            console.error("js-yaml library is not loaded. Cannot parse YAML.");
            throw new Error("YAML parser (js-yaml) not available.");
          }
          try {
            parsedSpec = jsyaml.load(spec);
          } catch (yamlError) {
            console.error("Error parsing Swagger/OpenAPI spec as JSON and YAML:", { jsonError, yamlError });
            throw new Error(`Failed to parse specification. Not valid JSON or YAML. JSON Error: ${jsonError.message}. YAML Error: ${yamlError.message}`);
          }
        }
      } else {
        throw new Error("Invalid specification format. Expected string or object.");
      }

      if (typeof parsedSpec !== 'object' || parsedSpec === null) {
        throw new Error("Parsed specification is not a valid object.");
      }

    } catch (e) {
      console.error("Error processing Swagger/OpenAPI spec:", e);
      // Render error inside the swagger container for visibility
      const specPreview = typeof spec === 'string' ? String(spec).substring(0, 500) + '...' : 'Input was an object.';
      swaggerContainer.innerHTML = `<div class="error"><h2>Error Processing API Specification</h2><p>${e.message}</p><pre>${specPreview}</pre></div>`;
      return;
    }

    SwaggerUIBundle({
      spec: parsedSpec,
      dom_id: '#swagger-container',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: "BaseLayout",
      deepLinking: true,
      supportedSubmitMethods: [],
      defaultModelsExpandDepth: -1,
    });
  }

  function renderMermaidDiagrams() {
    const mermaidElements = contentDiv.querySelectorAll('pre code.language-mermaid');
    if (mermaidElements.length === 0) return;

    const diagramsToRender = [];
    mermaidElements.forEach((el) => {
      const pre = el.parentElement;
      const code = el.textContent || '';
      if (code.trim()) {
        const mermaidDiv = document.createElement('div');
        mermaidDiv.className = 'mermaid';
        mermaidDiv.textContent = code;
        pre.parentNode.replaceChild(mermaidDiv, pre);
        diagramsToRender.push(mermaidDiv);
      } else {
        console.warn("Empty mermaid block found, skipping.");
        pre.parentNode.removeChild(pre); // Remove empty block
      }
    });

    if (diagramsToRender.length > 0) {
      try {
        mermaid.run({ nodes: diagramsToRender });
      } catch (error) {
        console.error("Mermaid rendering error:", error);
        diagramsToRender.forEach(div => {
          if (!div.querySelector('svg')) { // Check if rendering failed
            div.innerHTML = `<div class="error">Mermaid Error: ${error.message}</div>`;
          }
        });
      }
    }
  }

  function highlightCodeBlocks() {
    contentDiv.querySelectorAll('pre code').forEach((block) => {
      if (!block.classList.contains('language-mermaid')) {
        try {
          hljs.highlightElement(block);
        } catch (error) {
          console.error("Highlight.js error:", error, "on block:", block);
        }
      }
    });
  }

  function addCopyButtonsToCodeBlocks() {
    contentDiv.querySelectorAll('pre').forEach((pre) => {
      const codeElement = pre.querySelector('code');
      if (codeElement && !codeElement.classList.contains('language-mermaid') && !pre.closest('.code-block-wrapper')) {
        const code = codeElement.textContent;
        if (!code || code.trim() === '') return; // Skip empty blocks

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block';
        wrapper.style.position = 'relative';

        const button = document.createElement('button');
        button.className = 'copy-button fa fa-copy';
        button.setAttribute('aria-label', 'Copy code to clipboard');
        button.addEventListener('click', () => {
          navigator.clipboard.writeText(code).then(() => {
            button.className = 'copy-button';
            button.textContent = 'Copied!';
            button.disabled = true;
            setTimeout(() => {
              button.className = 'copy-button fa-copy';
              button.textContent = null;
              button.disabled = false;
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy code:', err);
            button.textContent = 'Error';
            setTimeout(() => { button.textContent = 'Copy'; }, 2000);
          });
        });

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        wrapper.appendChild(button);
      }
    });
  }

  function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.substring(0, start) + text + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  function replaceTextInRange(textarea, start, end, newText) {
    const value = textarea.value;
    textarea.value = value.substring(0, start) + newText + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + newText.length;
    textarea.focus();
  }

  async function handlePasteImage(event) {
    if (!currentUser) {
      showError("You must be logged in to upload images.", "warning");
      return;
    }

    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let imageItem = null;

    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        imageItem = item;
        break;
      }
    }

    if (imageItem) {
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) {
        showError("Could not get image file from clipboard.", "danger");
        return;
      }

      const textarea = event.target;
      const cursorStart = textarea.selectionStart;

      const placeholder = `![Uploading ${file.name || 'image'}...]`; // Use file.name if available
      insertTextAtCursor(textarea, placeholder);

      const placeholderStart = cursorStart;
      const placeholderEnd = cursorStart + placeholder.length;

      try {
        const fileExtension = file.type.split('/')[1] || 'png'; // Default to png if type is unknown
        const filename = `images/${currentUser.uid}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
        const storageRef = storage.ref().child(filename);

        const uploadTask = storageRef.put(file);

        // Optional: Add progress listener (can update UI element outside textarea)
        uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              console.log('Upload is ' + progress.toFixed(0) + '% done');
            },
            (error) => {
              console.error("Upload failed:", error);
              showError(`Image upload failed: ${error.message}`, "danger");
              replaceTextInRange(textarea, placeholderStart, placeholderEnd, `[Image upload failed: ${error.message}]`);
            },
            async () => {
              try {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                console.log('File available at', downloadURL);
                const markdownImage = `![${file.name}](${downloadURL})`;
                replaceTextInRange(textarea, placeholderStart, placeholderEnd, markdownImage);
                showError("Element uploaded successfully!", "success");
              } catch (urlError) {
                console.error("Error getting download URL:", urlError);
                showError(`Image upload successful, but failed to get URL: ${urlError.message}`, "danger");
                replaceTextInRange(textarea, placeholderStart, placeholderEnd, `[Error getting image URL]`);
              }
            }
        );

      } catch (error) {
        console.error("Error during upload process setup:", error);
        showError(`Image upload failed: ${error.message}`, "danger");
        replaceTextInRange(textarea, placeholderStart, placeholderEnd, `[Image upload failed: ${error.message}]`);
      }
    }
  }

  function setupGlobalEventListeners() {
    authContainer.addEventListener('click', (e) => {
      if (e.target.closest('#google-login-btn')) {
        handleGoogleSignIn();
      }
    });

    document.body.addEventListener('click', (e) => {
      const editPageBtn = e.target.closest('#edit-page-btn');
      const addChildPageBtn = e.target.closest('#add-child-page-btn');
      const deletePageBtn = e.target.closest('#delete-page-btn');
      const clonePageBtn = e.target.closest('#clone-page-btn'); // New

      if (deletePageBtn && currentPageData) {
        if (confirm(`Are you sure you want to delete the page "${currentPageData.title}" and all its subpages? This cannot be undone.`)) {
          handleDeletePage(currentPageData.id);
        }
      } else if (editPageBtn && currentPageData) {
        openPageEditor(currentPageData);
      } else if (addChildPageBtn && currentPageData) {
        // Corrected: A subpage's parent is the current page.
        openPageEditor(null, currentPageData.id);
      } else if (clonePageBtn && currentPageData) { // New
        handleClonePage();
      }
    });

    document.body.addEventListener('click', (e) => {
      if (e.target.closest('#new-root-page-btn')) {
        openPageEditor(null, null); // No parent, no initial data
      }
    });

    if (savePageButton) {
      savePageButton.addEventListener('click', handleSavePage);
    }

    document.body.addEventListener('click', (e) => {
      if (e.target.closest('#new-note-btn')) {
        openNoteEditor(null);
      }
    });

    if (saveNoteButton) { // Check if element exists
      saveNoteButton.addEventListener('click', handleSaveNote);
    }

    const userMenu = document.getElementById('user-menu');
    if (userMenu) { // Check if element exists
      userMenu.addEventListener('click', (e) => {
        if (e.target.closest('#logout-btn')) {
          handleSignOut();
        }
      });
    }

    window.addEventListener('hashchange', (e) => {
      const hash = window.location.hash.substring(1);
      loadPage(hash);
    });

    if (searchInput) {
      searchInput.addEventListener('input', handleSearch);
    } else {
      console.warn("Search input element not found.");
    }

    if (submitAiQuestionButton) {
      submitAiQuestionButton.addEventListener('click', handleSubmitAiQuestion);
    }
    if (askAiModalElement) {
      askAiModalElement.addEventListener('hidden.bs.modal', () => {
        if (askAiForm) askAiForm.reset();
        if (aiQuestionInput) aiQuestionInput.value = '';
        if (submitAiQuestionButton) {
          submitAiQuestionButton.disabled = false;
          submitAiQuestionButton.innerHTML = 'Ask AI';
        }
      });
    }
  }

  async function handleSubmitAiQuestion() {
    if (!currentUser) {
      showError("You must be logged in to use the AI assistant.");
      return;
    }

    const question = aiQuestionInput.value.trim();
    const mode = aiModeSelect.value;

    if (!question) {
      showError("Please enter a question.", "warning");
      aiQuestionInput.focus();
      return;
    }

    submitAiQuestionButton.disabled = true;
    submitAiQuestionButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Asking...';

    console.log(question);
    const result = await askAiQuestion(question, mode)

    if (!result) return;

    askAiModal.hide();
    switch (mode) {
      case 'new_page':
        console.log(result);
        openPageEditor(null, currentPageData.id, { title: result.title, content: result.answer, type: 'markdown' }, question);
        break;
      case 'fix_page':
        openPageEditor({ ...currentPageData, content: result.answer }, null, null, question);
        break;
      case 'edit_page':
        const newContent = (currentPageData.content || "") + "\n\n---\nAI Suggestion:\n" + result.answer;
        openPageEditor({ ...currentPageData, content: newContent }, null, null, question);
        break;
      case 'ask':
        openNoteEditor({ title: question, content: result.answer }, question)
        break;
    }
  }

  async function askAiQuestion(question, mode) {
    try {
        if (!currentUser) {
            console.log('No hay usuario, intentando login anónimo...');
            const userCredential = await auth.signInAnonymously();
            currentUser = userCredential.user;
            console.log('Login anónimo exitoso:', currentUser.uid);
        }

        const token = await currentUser.getIdToken(true);
        console.log('Token obtenido:', token ? 'Sí' : 'No');
        console.log('Token completo:', token); // Log del token completo para debug

        if (!token) {
            throw new Error('No se pudo obtener el token de autenticación');
        }

        const requestBody = {
            question: question,
            page_id: currentPageData?.id
        };

        const url = `${AI_SERVICE_URL}/${mode}`;
        console.log('URL completa:', url);
        console.log('Headers:', {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        });
        console.log('Body:', requestBody);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Error desconocido" }));
            console.error('Error en la respuesta:', response.status, errorData);
            throw new Error(`Error del servidor: ${response.status} - ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error en askAiQuestion:', error);
        showError(`Error al comunicarse con el asistente: ${error.message}`, "danger");
        throw error;
    }
  }

  // --- Utilities ---

  function showError(message, status = "danger") {
    container = document.body
    const existingError = container.querySelector('.app-error');
    if (existingError) {
      existingError.remove();
    }

    const toastDiv = document.createElement('div');
    toastDiv.className = `app-toast-message alert alert-${status} shadow-sm`;
    toastDiv.textContent = message;
    toastDiv.style.position = 'fixed';
    toastDiv.style.bottom = '20px';
    toastDiv.style.left = '50%';
    toastDiv.style.transform = 'translateX(-50%)';
    toastDiv.style.padding = '1rem 1.5rem';
    toastDiv.style.borderRadius = '.25rem';
    toastDiv.style.zIndex = '2050'; // Más alto que el modal de Bootstrap (1050-1055)
    toastDiv.setAttribute('role', 'alert');

    container.appendChild(toastDiv);

    setTimeout(() => {
      if (toastDiv.parentNode) {
        toastDiv.remove();
      }
    }, 4000);
  }

  function renderError(message) {
    const editControls = document.getElementById('page-edit-controls');
    if (editControls) editControls.remove();
    const pageControls = document.getElementById('page-action-controls');
    if (pageControls) {
      pageControls.innerHTML = '';
      pageControls.style.display = 'none';
    }
    renderBreadcrumbs(null);

    contentDiv.innerHTML = `
      <div class="error p-4">
        <h2>Error</h2>
        <p>${message}</p>
      </div>
    `;
    swaggerContainer.style.display = 'none';
    contentDiv.style.display = 'block';
  }

  function renderWelcome() {
    const editControls = document.getElementById('page-edit-controls');
    if (editControls) editControls.remove();
    const pageControls = document.getElementById('page-action-controls');
    if (pageControls) {
      pageControls.innerHTML = '';
      pageControls.style.display = 'none';
    }
    renderBreadcrumbs(null);

    contentDiv.innerHTML = `
      <div class="error p-4">
        <h2>Welcome</h2>
        <p>Please login with Google Account.</p>
      </div>
    `;
    swaggerContainer.style.display = 'none';
    contentDiv.style.display = 'block';
  }

  function handleDragStart(e) {
    if (!currentUser) return;
    const targetLi = e.target.closest('li[draggable="true"]');
    if (targetLi && targetLi.dataset.pageId) {
      draggedElementId = targetLi.dataset.pageId;
      e.dataTransfer.setData('text/plain', draggedElementId);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => targetLi.classList.add('dragging'), 0);
    } else {
      e.preventDefault();
    }
  }

  function handleDragOver(e) {
    e.preventDefault(); // Necesario para permitir el drop
    if (!currentUser || !draggedElementId) return;

    const targetElement = e.target.closest('li[draggable="true"], ul#nav-links'); // Puede ser un LI o el UL raíz
    if (!targetElement) return;

    clearDragOverClasses();

    if (targetElement.tagName === 'LI') {
      const targetId = targetElement.dataset.pageId;
      if (targetId === draggedElementId) return;

      const rect = targetElement.getBoundingClientRect();
      const verticalMidpoint = rect.top + rect.height / 2;
      const horizontalMidpoint = rect.left + rect.width * 0.8;

      if (e.clientY < verticalMidpoint) {
        targetElement.classList.add('drag-over-top');
      } else if (e.clientX > horizontalMidpoint) {
        targetElement.classList.add('drag-over-inside');
      } else {
        targetElement.classList.add('drag-over-bottom');
      }
    } else if (targetElement.id === 'nav-links') {
      // Si se arrastra sobre el UL raíz (espacio vacío)
      targetElement.classList.add('drag-over-root');
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    if (!currentUser || !draggedElementId) return;

    const droppedOnElement = e.target.closest('li[draggable="true"], ul#nav-links');
    clearDragOverClasses();

    if (!droppedOnElement) {
      draggedElementId = null;
      return;
    }

    const draggedId = draggedElementId;
    draggedElementId = null;

    let newParentId = null;
    let newOrder = 0;
    let targetId = null;
    let dropPosition = null;

    if (droppedOnElement.tagName === 'LI') {
      targetId = droppedOnElement.dataset.pageId;
      if (targetId === draggedId) return;

      const rect = droppedOnElement.getBoundingClientRect();
      const verticalMidpoint = rect.top + rect.height / 2;
      const horizontalMidpoint = rect.left + rect.width * 0.8;

      if (e.clientY < verticalMidpoint) {
        dropPosition = 'before';
        newParentId = droppedOnElement.dataset.pageParent || null;
        // Calcular orden basado en el elemento anterior y el target
        const prevSibling = droppedOnElement.previousElementSibling;
        const targetOrder = parseFloat(droppedOnElement.dataset.pageOrder || 0);
        const prevOrder = prevSibling ? parseFloat(prevSibling.dataset.pageOrder || 0) : -1; // Usar -1 si es el primero
        newOrder = (prevOrder + targetOrder) / 2;

      } else if (e.clientX > horizontalMidpoint) {
        dropPosition = 'inside';
        newParentId = targetId; // Hacerlo hijo del target
        // Ponerlo al principio o final de los hijos (simplificado: ponerlo al principio)
        newOrder = -1; // O buscar el order más bajo de los hijos y restarle
      } else {
        dropPosition = 'after';
        newParentId = droppedOnElement.dataset.pageParent || null;
        // Calcular orden basado en el target y el siguiente elemento
        const nextSibling = droppedOnElement.nextElementSibling;
        const targetOrder = parseFloat(droppedOnElement.dataset.pageOrder || 0);
        const nextOrder = nextSibling ? parseFloat(nextSibling.dataset.pageOrder || 0) : targetOrder + 2; // Añadir un margen si es el último
        newOrder = (targetOrder + nextOrder) / 2;
      }
    } else if (droppedOnElement.id === 'nav-links') {
      dropPosition = 'root';
      newParentId = null;

      const lastRootItem = navLinksList.lastElementChild;
      newOrder = lastRootItem ? parseFloat(lastRootItem.dataset.pageOrder || 0) + 1 : 0;
    }

    try {
      await updatePageOrderAndParent(draggedId, newParentId, newOrder);
      showError('Page order/parent updated successfully.', 'success');
      clearDragOverClasses()
      await setupNavigation();
    } catch (error) {
      console.error("Error updating page order/parent:", error);
      showError(`Failed to update page: ${error.message}`);
      await setupNavigation();
    }
  }

  function clearDragOverClasses() {
    navLinksList.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-inside').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
    });
  }

  function handleDragEnd(e) {
    const draggingElement = navLinksList.querySelector('.dragging');
    if (draggingElement) {
      draggingElement.classList.remove('dragging');
    }
    clearDragOverClasses();
    navLinksList.classList.remove('drag-over-root')
    draggedElementId = null; // Asegurarse de limpiar el ID
  }

  function handleDragEnter(e) {
    e.preventDefault();
  }

  function handleDragLeave(e) {
    const relatedTarget = e.relatedTarget;
    const listArea = navLinksList;

    if (!relatedTarget || !listArea.contains(relatedTarget)) {
      clearDragOverClasses();
    } else {
      const targetLi = e.target.closest('li[draggable="true"]');
      if (targetLi && !targetLi.contains(relatedTarget)) {
        targetLi.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
      }
    }
  }

  async function updatePageOrderAndParent(pageId, newParentId, newOrder) {
    if (!currentUser) {
      throw new Error("Authentication required to reorder pages.");
    }
    if (!pageId) {
      throw new Error("Invalid page ID provided for update.");
    }

    const pageRef = db.collection('pages').doc(pageId);
    await pageRef.update({
      parent: newParentId,
      order: newOrder,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function fetchAncestors(pageId) {
    const path = [];
    let currentId = pageId;

    while (currentId) {
      try {
        const doc = await db.collection('pages').doc(currentId).get();
        if (doc.exists) {
          const data = doc.data();
          path.unshift({ id: doc.id, title: data.title });
          currentId = data.parent || null; // Move to the parent
        } else {
          console.warn(`Ancestor page with ID "${currentId}" not found during path construction.`);
        }
      } catch (error) {
        console.error(`Error fetching ancestor page ${currentId}:`, error);
        currentId = null;
      }
    }
    return path;
  }

  function renderBreadcrumbs(ancestorPath) {
    if (!breadcrumbContainer) return;

    breadcrumbContainer.innerHTML = '';
    breadcrumbContainer.style.display = 'none';

    if (!ancestorPath || ancestorPath.length === 0) {
      return;
    }

    const ol = document.createElement('ol');
    ol.className = 'breadcrumb';


    ancestorPath.forEach((page, index) => {
      const li = document.createElement('li');
      li.className = 'breadcrumb-item';

      if (index === ancestorPath.length - 1) {
        li.classList.add('active');
        li.setAttribute('aria-current', 'page');
        li.textContent = page.title;
      } else {
        const link = document.createElement('a');
        link.href = `#${page.id}`;
        link.textContent = page.title;
        li.appendChild(link);
      }
      ol.appendChild(li);
    });

    breadcrumbContainer.appendChild(ol);
    breadcrumbContainer.style.display = 'block';
  }

})();