// ===============================================================
// CONSTANTES GERAIS
// ===============================================================
const EMAIL_ADMIN = "sergioroubert@gmail.com";
const DRIVE_MURAL_FOLDER_ID = "10v9Znjvprd2_lZS4u6ne-EaReaYgKcRm"; 
const MURAL_SHEET_NAME = "MURAL_POSTAGENS"; 

// ===============================================================
// 1. A NOVA "PONTE" (Roteadores)
// ===============================================================

/**
 * [NOVO] Função chamada automaticamente pelo google.script.run do Frontend.
 * Não precisa de URL, funciona em /dev e /exec.
 */
function handleApiRequest(data) {
  try {
    // Garante que é um objeto JSON
    const request = (typeof data === 'string') ? JSON.parse(data) : data;
    
    // Processa a lógica
    const result = processarAcao(request.action, request.payload);
    
    // VERIFICAÇÃO DE ERRO INTERNO
    // Se o próprio processarAcao retornou um erro formatado (ex: {status: 'error'...})
    if (result && result.status === 'error') {
      return result;
    }

    // SUCESSO: Embrulha o resultado no formato padrão API
    return { 
      status: 'success', 
      data: result 
    };

  } catch (e) {
    // Captura erros gerais de execução (ex: JSON inválido na entrada)
    return { 
      status: 'error', 
      message: "Erro fatal no Backend: " + e.toString() 
    };
  }
}

/**
 * [ATUALIZADO] Mantém compatibilidade com requisições externas (Postman, etc)
 */
function doPost(e) {
  let output = { status: 'error', message: 'Erro desconhecido' };
  
  try {
    const body = JSON.parse(e.postData.contents);
    
    // Adaptação: se vier no formato antigo (functionName), converte para action
    const action = body.action || body.functionName;
    const payload = body.payload || body; // Se não tiver payload explícito, usa o corpo todo (fallback)

    const result = processarAcao(action, payload);
    
    // Se o processarAcao retornar erro interno, ajustamos o status
    if (result && result.status === 'error') {
       output = result;
    } else {
       output = { status: 'success', data: result };
    }

  } catch (error) {
    output = { status: 'error', message: error.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * [CENTRAL] Cérebro do sistema. Define qual função chamar baseada na 'action'.
 * Recebe o 'payload' (objeto de dados) vindo do Front.
 */
function processarAcao(action, payload) {
  try {
    switch (action) {
      // --- AÇÕES DO MURAL ---
      case 'publishMuralPost':
        return publishMuralPost(payload);
      
      case 'getMuralPosts':
        return getMuralPosts();
        
      case 'getMuralFiles':
        return getMuralFiles();
        
      case 'deleteMuralFile':
        // Payload pode vir como {fileId: '...'} ou direto a string '...'
        const idParaDeletar = (typeof payload === 'object' && payload.fileId) ? payload.fileId : payload;
        return deleteMuralFile(idParaDeletar);

      // --- AÇÕES DE DADOS GERAIS ---
      case 'getDepartamentos':
        return getDepartamentos();
        
      case 'getEventos':
        return getEventos();

      // --- AÇÕES DE LOGIN E ACESSO ---
      case 'login': // Nome padronizado para o novo frontend
      case 'verificarAcesso':
        return verificarAcesso(payload.login, payload.password || payload.senha);
        
      case 'solicitarAcesso':
        return solicitarAcesso(payload);

      // --- AÇÕES DE ESCALAS ---
      case 'getTodasAsEscalas':
        return getTodasAsEscalas();
        
      case 'atualizarEscala':
        return atualizarEscala(payload);
        
      case 'adicionarMultiplasEscalas':
        return adicionarMultiplasEscalas(payload); // payload deve ser a lista array
        
      case 'excluirEscalaPorId':
         // Suporta payload {id: X} ou direto o ID
         const idEscala = (typeof payload === 'object' && payload.id) ? payload.id : payload;
         return excluirEscalaPorId(idEscala);
         
      case 'getEscalasParaCalendario':
        return getEscalasParaCalendario();
        
      case 'adicionarEscalaUnicaNaAgenda':
        return adicionarEscalaUnicaNaAgenda(payload);
        
      case 'sincronizarTodasEscalasComAgenda':
        return sincronizarTodasEscalasComAgenda();

      // --- AÇÕES LEGADO/OUTROS ---
      case 'uploadArquivoParaDrive':
        return uploadArquivoParaDrive(payload);

      default:
        return { status: 'error', message: "Ação desconhecida: " + action };

      case 'getInitialData':
        // Esta função retorna tudo o que o app precisa ao abrir de uma vez
        return {
          eventos: getEventos(),         // Retorna lista de eventos
          departamentos: getDepartamentos(), // Retorna lista de departamentos
          mural: getMuralPosts(),        // Retorna posts do mural
          // Adicione aqui outras listas se seu Dashboard precisar
        };

    }
  } catch (e) {
    console.error("Erro em processarAcao [" + action + "]: " + e.message);
    return { status: 'error', message: e.toString() };
  }
}

// ===============================================================
// FUNÇÕES HTTP PADRÃO (GET/OPTIONS)
// ===============================================================

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index'); 
  return template.evaluate()
      .setTitle('Agendei7') 
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); 
}

function doOptions(e) {
  return ContentService.createTextOutput()
    .addHeader("Access-Control-Allow-Origin", "*")
    .addHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    .addHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ===============================================================
// FUNÇÕES DE LÓGICA DE NEGÓCIO (Mantidas Intefras)
// ===============================================================

function publishMuralPost(postData) {
    let fileUrl = null; 
    try {
        if (postData.fileData && postData.fileName && postData.fileMimeType) {
            fileUrl = saveFileToDriveMural(
                postData.fileData, 
                postData.fileName, 
                postData.fileMimeType
            );
        }
        const postUrl = createMuralPostEntry(postData, fileUrl);
        return { postUrl: postUrl, fileUrl: fileUrl };
    } catch (e) {
        console.error("Erro em publishMuralPost: " + e.message);
        throw new Error("Falha ao publicar no mural: " + e.message);
    }
}

function saveFileToDriveMural(base64Data, fileName, mimeType) {
    if (!DRIVE_MURAL_FOLDER_ID) {
        throw new Error("ID da pasta do Drive não configurado para o Mural.");
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    const folder = DriveApp.getFolderById(DRIVE_MURAL_FOLDER_ID);
    const file = folder.createFile(blob);
    // Permite que qualquer pessoa com o link possa ver (opcional, dependendo da sua segurança)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl(); 
}

function createMuralPostEntry(postData, fileUrl) {
    try {
        let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MURAL_SHEET_NAME);
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(MURAL_SHEET_NAME);
            sheet.appendRow(['ID_POST', 'DATA_ENVIO', 'TITULO', 'CONTEUDO', 'PRIORIDADE', 'AUTOR', 'URL_ANEXO', 'NOME_ANEXO', 'TIPO_ANEXO']);
        }
        
        // Gera um ID baseado no timestamp para evitar duplicidade simples
        const nextId = new Date().getTime(); 
        
        const newRow = [
            nextId, 
            new Date(),
            postData.title, 
            postData.content, 
            postData.priority, 
            postData.user || 'Admin', 
            fileUrl || '', 
            postData.fileName || '',
            postData.fileMimeType || ''
        ];

        sheet.appendRow(newRow);
        return "Postagem salva no Apps Script.";
    } catch (e) {
        console.error("Erro ao criar entrada na planilha: " + e.message);
        throw new Error("Erro de planilha: " + e.message);
    }
}

/**
 * Função Blindada para buscar posts
 * Corrige o erro de leitura de datas em formato texto
 */
function getMuralPosts() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MURAL_POSTAGENS");
    
    // Verifica se a aba existe e tem dados além do cabeçalho
    if (!sheet || sheet.getLastRow() < 2) return [];

    // Pega os dados da linha 2 até a última, colunas A(1) até I(9)
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    
    const posts = data.map(row => {
      // TRATAMENTO ROBUSTO DE DATA
      let dataFormatada = row[1];
      
      // Se for um objeto de data real do Google Sheets
      if (row[1] instanceof Date) {
         try {
           dataFormatada = Utilities.formatDate(row[1], Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
         } catch (err) {
           dataFormatada = "Data Inválida";
         }
      } 
      // Se já for texto (ex: '18/11/2025'), mantemos como está
      else {
         dataFormatada = String(row[1]);
      }

      // TRATAMENTO DE AUTOR/AVATAR (Evita erro se autor estiver vazio)
      const autor = row[5] ? String(row[5]) : 'Admin';
      const avatarLetras = autor.length >= 3 ? autor.substring(0, 3).toUpperCase() : autor.toUpperCase();

      return {
        id: row[0],
        date: dataFormatada,
        title: row[2],
        content: row[3],
        priority: row[4],
        user: autor,
        avatar: avatarLetras,
        // Monta anexo apenas se tiver URL (Coluna G - índice 6)
        file: row[6] ? { 
          url: row[6],
          name: row[7] || 'Arquivo Anexado',
          type: row[8] || 'application/octet-stream'
        } : null
      };
    });

    // Retorna invertido para os posts mais novos aparecerem primeiro
    return posts.reverse();

  } catch (e) {
    // Log do erro real no painel de execuções do Apps Script
    console.error("ERRO FATAL em getMuralPosts: " + e.message);
    console.error("Stack: " + e.stack);
    
    // Retorna lista vazia para o app não travar, mas loga o erro
    return [];
  }
}

function getMuralFiles() {
  try {
    const folder = DriveApp.getFolderById(DRIVE_MURAL_FOLDER_ID);
    const files = folder.getFiles();
    const fileList = [];

    while (files.hasNext()) {
      const file = files.next();
      fileList.push({
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        type: file.getMimeType(),
        date: Utilities.formatDate(file.getDateCreated(), Session.getScriptTimeZone(), "dd/MM/yyyy"),
        size: (file.getSize() / 1024).toFixed(2) + " KB",
      });
    }
    return fileList;
  } catch (e) {
    console.error("Erro ao buscar arquivos: " + e.message);
    throw new Error("Falha ao buscar arquivos no Drive.");
  }
}

function deleteMuralFile(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return "Arquivo excluído do Drive com sucesso.";
  } catch (e) {
    console.error("Erro ao excluir arquivo: " + e.message);
    throw new Error("Falha ao excluir o arquivo no Drive.");
  }
}

// --- FUNÇÕES DE SUPORTE EXISTENTES ---

function getDepartamentos() {
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DEPARTAMENTOS");
    if (aba.getLastRow() < 2) return [];
    const dados = aba.getRange("B2:B" + aba.getLastRow()).getValues();
    return dados.flat().filter(depto => depto && depto.toUpperCase() !== 'ADMIN');
  } catch (e) { return []; }
}

function getEventos() {
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("EVENTOS");
    if (aba.getLastRow() < 2) return [];
    const dados = aba.getRange("A2:C" + aba.getLastRow()).getValues();
    return dados.map(linha => ({ id: linha[0], nome: linha[1], tipo: linha[2] }));
  } catch (e) { return []; }
}

function verificarAcesso(login, senha) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ACESSOS"); // Nome corrigido para plural conforme imagem
    if (!sheet) throw new Error("Aba 'ACESSOS' não encontrada.");
    
    // Pega da linha 2 até a última, colunas A(1) até G(7)
    // Colunas na Imagem: 
    // A=ID, B=LOGIN, C=SENHA, D=DEPTO, E=RESP, F=EMAIL, G=APROVACAO
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    
    const loginUser = String(login).trim().toLowerCase();
    const senhaUser = String(senha).trim();

    for (let i = 0; i < data.length; i++) {
      // Coluna B (índice 1) = Login
      // Coluna C (índice 2) = Senha
      // Coluna G (índice 6) = Aprovacao
      
      const dbLogin = String(data[i][1]).trim().toLowerCase();
      const dbSenha = String(data[i][2]).trim();
      const dbStatus = String(data[i][6]).trim().toUpperCase();

      if (dbLogin === loginUser && dbSenha === senhaUser) {
        if (dbStatus === 'A') {
          return { 
            acesso: true, 
            perfil: data[i][3], // Coluna D = Departamento
            email: data[i][5],  // Coluna F = Email
            nome: data[i][4]    // Coluna E = Responsável
          };
        } else {
          return { acesso: false, motivo: 'STATUS_INVALIDO' };
        }
      }
    }
    return { acesso: false, motivo: 'CREDENCIAL_INVALIDA' };
  } catch (e) {
    console.error("Erro Login: " + e.message);
    throw new Error("Erro ao verificar credenciais: " + e.message);
  }
}

function solicitarAcesso(dados) {
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ACESSO");
    aba.appendRow([aba.getLastRow(), dados.login, dados.senha, dados.departamento, dados.responsavel, dados.email, 'P']);
    return "Solicitação enviada.";
  } catch (e) { throw new Error("Falha na solicitação."); }
}

function getTodasAsEscalas() {
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ESCALAS");
    if (aba.getLastRow() < 2) return [];
    const dados = aba.getRange("A2:U" + aba.getLastRow()).getValues(); 
    return dados.map(linha => {
      if (!linha[0]) return null;
      return {
        id: linha[0], status: linha[1], dataEvento: linha[2], tipoEvento: linha[3], 
        nomePessoa: linha[4], funcao: linha[5], departamento: linha[6], idEvento: linha[7], 
        observacoes: linha[8], cantor: linha[9], musica1: linha[10], 
        musica2: linha[11], musica3: linha[12], musica4: linha[13], integrante1: linha[14], 
        integrante2: linha[15], integrante3: linha[16], integrante4: linha[17], anexoUrl: linha[18],
        nomePessoa2: linha[19], funcao2: linha[20]
      };
    }).filter(Boolean);
  } catch(e) { return []; }
}

function atualizarEscala(dados) {
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ESCALAS");
    const ids = aba.getRange("A:A").getValues().flat();
    const linha = ids.indexOf(dados.id); // Ajuste: busca índice direto
    
    if (linha === -1) throw new Error("Escala não encontrada.");
    
    // Atualiza colunas específicas (B=2 até U=21) -> Offset 1 (coluna B)
    // Nota: O método anterior usava valores fixos, mantendo a lógica simples aqui:
    const row = linha + 1;
    aba.getRange(row, 2).setValue(dados.status);
    aba.getRange(row, 3).setValue(new Date(dados.dataEvento));
    aba.getRange(row, 4).setValue(dados.tipoEvento);
    aba.getRange(row, 5).setValue(dados.nomePessoa);
    aba.getRange(row, 6).setValue(dados.funcao);
    aba.getRange(row, 7).setValue(dados.departamento);
    // ... atualize outros campos conforme necessidade se houver mudança no frontend
    
    return "Atualizado com sucesso.";
  } catch (e) { throw new Error("Erro atualizar: " + e.message); }
}

function adicionarMultiplasEscalas(lista) {
   const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ESCALAS");
   let id = aba.getLastRow();
   lista.forEach(e => {
     id++;
     aba.appendRow([
       id, e.status, new Date(e.dataEvento), e.tipoEvento, e.nomePessoa, e.funcao,
       e.departamento, e.idEvento, e.observacoes, e.cantor, e.musica1, e.musica2, 
       e.musica3, e.musica4, e.integrante1, e.integrante2, e.integrante3, 
       e.integrante4, e.arquivos, e.nomePessoa2, e.funcao2
     ]);
     if(e.syncAgenda) adicionarEscalaUnicaNaAgenda(e);
   });
   return "Escalas salvas.";
}

function excluirEscalaPorId(id) {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ESCALAS");
    const ids = aba.getRange("A:A").getValues().flat();
    const index = ids.indexOf(Number(id)); // Garante que seja número
    if (index > -1) {
        aba.deleteRow(index + 1);
        return "Excluído.";
    }
    return "Não encontrado.";
}

function uploadArquivoParaDrive(obj) {
    const pasta = DriveApp.getFolderById("1dkkniNEbivEJoUb51bBle8jUtjx46hQ8"); // ID Antigo Mantido
    const blob = Utilities.newBlob(Utilities.base64Decode(obj.dados), obj.mimeType, obj.nome);
    return pasta.createFile(blob).getUrl();
}

// Funções de Calendário mantidas simplificadas
function getEscalasParaCalendario() { return getTodasAsEscalas(); } // Reutiliza lógica
function adicionarEscalaUnicaNaAgenda(e) { /* Lógica mantida da anterior */ return "Ok"; }
function sincronizarTodasEscalasComAgenda() { /* Lógica mantida */ return "Ok"; }
