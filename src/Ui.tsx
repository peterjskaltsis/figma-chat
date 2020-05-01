import 'mobx-react-lite/batchingForReactDom';
import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import * as ReactDOM from 'react-dom';
import styled, { createGlobalStyle } from 'styled-components';
import {
  MemoryRouter as Router,
  Redirect,
  Route,
  Switch,
} from 'react-router-dom';
import io from 'socket.io-client';
// styles
import './assets/css/ui.css';
import './assets/figma-ui/main.min.css';
// components
import Notifications from './components/Notifications';
// shared
import { DEFAULT_SERVER_URL } from './shared/constants';
import { ConnectionEnum } from './shared/interfaces';
import { SocketProvider } from './shared/SocketProvider';
import { sendMainMessage } from './shared/utils';
// views
import ChatView from './views/Chat';
import MinimizedView from './views/Minimized';
import UserListView from './views/UserList';

import { StoreProvider, useStore } from './store';
import { reaction } from 'mobx';

onmessage = (message) => {
  if (message.data.pluginMessage) {
    const { type, payload } = message.data.pluginMessage;

    // initialize
    if (type === 'ready') {
      sendMainMessage('initialize');
    }

    if (type === 'initialize') {
      init(payload !== '' ? payload : DEFAULT_SERVER_URL);
    }
  }
};

const GlobalStyle = createGlobalStyle`
  body {
    overflow: hidden;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.004);
    text-rendering: optimizeLegibility !important;
    -webkit-font-smoothing: antialiased !important;
  }
`;

const AppWrapper = styled.div`
  overflow: hidden;
`;

const init = (serverUrl) => {
  const App = observer(() => {
    const store = useStore();
    let [socket, setSocket] = useState<SocketIOClient.Socket>(undefined);

    function onFocus() {
      sendMainMessage('focus', false);

      store.isFocused = false;
    }
    function onFocusOut() {
      sendMainMessage('focus', false);
      store.isFocused = false;
    }

    function initSocketConnection() {
      const url = store.settings.url || serverUrl;
      store.status = ConnectionEnum.NONE;

      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }

      setSocket(
        io(url, {
          reconnectionAttempts: 3,
          forceNew: true,
          transports: ['websocket'],
        })
      );

      sendMainMessage('get-root-data');
    }

    useEffect(() => {
      if (socket && store.status === ConnectionEnum.NONE) {
        socket.on('connected', () => {
          store.status = ConnectionEnum.CONNECTED;

          socket.emit('set user', store.settings);
          socket.emit('join room', {
            room: store.roomName,
            settings: store.settings,
          });

          sendMainMessage('ask-for-relaunch-message');
        });

        socket.on('connect_error', () => {
          store.status = ConnectionEnum.ERROR;
        });

        socket.on('reconnect_error', () => {
          store.status = ConnectionEnum.ERROR;
        });

        socket.on('chat message', (data) => {
          store.addMessage(data);
        });

        socket.on('join leave message', (data) => {
          const username = data.user.name || 'Anon';
          let message = 'joins the conversation';

          if (data.type === 'LEAVE') {
            message = 'leaves the conversation';
          }
          store.addNotification(`${username} ${message}`);
        });

        socket.on('online', (data) => (store.online = data));
      }

      return () => {
        if (socket) {
          socket.removeAllListeners();
          socket.disconnect();
        }
      };
    }, [socket]);

    useEffect(() => {
      const serverUrlDisposer = reaction(
        () => store.settings.url,
        initSocketConnection
      );

      // check focus
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onFocusOut);

      return () => {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onFocusOut);
        serverUrlDisposer();
      };
    }, []);

    return (
      <AppWrapper>
        <GlobalStyle />
        <Notifications />

        <SocketProvider socket={socket}>
          <Router>
            {store.isMinimized && <Redirect to="/minimized" />}
            <Switch>
              <Route exact path="/minimized">
                <MinimizedView />
              </Route>
              <Route path="/user-list">
                <UserListView />
              </Route>
              <Route path="/">
                <ChatView />
              </Route>
            </Switch>
          </Router>
        </SocketProvider>
      </AppWrapper>
    );
  });

  ReactDOM.render(
    <StoreProvider>
      <App />
    </StoreProvider>,
    document.getElementById('app')
  );
};
