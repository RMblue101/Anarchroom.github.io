Instalação e execução do servidor WebSocket (Node.js + socket.io)

Pré-requisitos (Linux Mint):

- Instalar Node.js (recomendado Node 18+)

  ```bash
  sudo apt update
  sudo apt install -y nodejs npm
  node -v
  npm -v
  ```

- Ir para a pasta do servidor e instalar dependências:

  ```bash
  cd "Prova de aptidão Proficional/Chat_PAP/server"
  npm install
  ```

- Executar o servidor:

  ```bash
  npm start
  ```

O servidor por defeito escuta na porta `3000`. Se o servidor estiver atrás de firewall/ufw, permita a porta:

```bash
sudo ufw allow 3000/tcp
```

Notas do cliente:
- O cliente (`templates/chat.html`) tenta carregar o cliente socket.io do mesmo host na porta 3000.
- Se servir as páginas via Apache no mesmo servidor, abra-as http://SEU_HOST/templates/chat.html?room=CODIGO
- Alternativa sem Node.js: pode usar polling ou um backend PHP com bibliotecas WebSocket (por exemplo Ratchet), mas socket.io/Node.js é a opção mais simples para comunicação em tempo real.
