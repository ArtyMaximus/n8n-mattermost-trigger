# @artymaximus/n8n-mattermost-trigger

Это улучшенная версия пользовательской ноды-триггера для n8n, основанная на [оригинальной работе Alexey Gusev](https://www.npmjs.com/package/n8n-nodes-mattermost-trigger), с добавлением **надёжного автопереподключения** и **мониторинга heartbeat**.

## 🙏 Благодарности

Эта нода основана на оригинальной работе [Alexey Gusev](https://github.com/myluffe/n8n-nodes-mattermost-trigger). Мы добавили функции автопереподключения и улучшили стабильность соединения.

## 🚀 Ключевые особенности

- **Автопереподключение** с экспоненциальным backoff (5с → 60с макс.)
- **Мониторинг heartbeat** с ping/pong (интервал 30с, тайм-аут 10с)
- **Устойчивость соединения** - обрабатывает обрывы сети, тайм-ауты и перезапуски сервера
- **Production-ready логирование** - минимальные логи по умолчанию, режим отладки доступен
- **Бесконечные попытки переподключения** - не сдаётся до деактивации воркфлоу
- **Правильная очистка ресурсов** - никаких утечек памяти при остановке воркфлоу

## 🔧 Улучшенная обработка соединений

### Сценарии автопереподключения
- ✅ Обрывы сетевого соединения
- ✅ Перезапуски сервера Mattermost
- ✅ Тайм-ауты прокси/балансировщиков нагрузки
- ✅ Завершение неактивных соединений
- ✅ Ошибки рукопожатия WebSocket
- ✅ Ошибки аутентификации

### Система heartbeat
- Отправляет ping каждые **30 секунд**
- Ожидает pong в течение **10 секунд**
- Принудительно закрывает и переподключается при тайм-ауте pong
- Предотвращает "зомби" соединения

### Стратегия переподключения
- **1-я попытка:** 5 секунд
- **2-я попытка:** 10 секунд
- **3-я попытка:** 20 секунд
- **4-я попытка:** 40 секунд
- **5+ попытки:** 60 секунд (с джиттером)
- **Продолжается бесконечно** до восстановления соединения

## 📦 Установка

### Установка в Docker (Рекомендуется)

1. **Соберите ноду:**
```powershell
cd путь/к/n8n-nodes-mattermost-trigger
pnpm install
pnpm run build
npm pack
```

2. **Скопируйте в контекст Docker:**
```bash
# Скопируйте .tgz файл в контекст сборки Docker n8n
cp n8n-nodes-mattermost-trigger-*.tgz /путь/к/docker/custom-nodes/
```

3. **Обновите Dockerfile:**
```dockerfile
# Добавьте после установки n8n
USER root
COPY ./custom-nodes/n8n-nodes-mattermost-trigger-*.tgz /opt/custom/nodes/
RUN mkdir -p /opt/custom/extensions/mattermost \
 && cd /opt/custom/extensions/mattermost \
 && npm init -y \
 && npm install --omit=dev /opt/custom/nodes/n8n-nodes-mattermost-trigger-*.tgz \
 && chown -R node:node /opt/custom
ENV N8N_CUSTOM_EXTENSIONS=/opt/custom/extensions/mattermost
USER node
```

4. **Пересоберите и перезапустите:**
```bash
docker compose build --no-cache n8n
docker compose up -d n8n
```

### Локальная установка

```bash
# Установите зависимости
npm install -g pnpm
pnpm install
pnpm run build

# Свяжите глобально
pnpm link --global

# В папке вашего n8n
pnpm link n8n-nodes-mattermost-trigger

# Запустите n8n с пользовательскими расширениями
export N8N_CUSTOM_EXTENSIONS="путь/к/n8n-nodes-mattermost-trigger"
n8n start
```

## ⚙️ Конфигурация

### Настройка учётных данных
1. Создайте учётные данные **Mattermost Trigger API**
2. Установите **Base URL**: `https://ваш-сервер-mattermost.com`
3. Установите **Token**: Ваш bot token или Personal Access Token

### Конфигурация ноды
1. **Resources**: Выберите категории событий (Post, Reaction, User и т.д.)
2. **Events**: Выберите конкретные события из выбранных ресурсов
3. **Custom Events**: Добавьте пользовательские события через запятую при необходимости

### Рекомендуемые настройки Mattermost
```json
{
  "ServiceSettings": {
    "EnableReliableWebSockets": true
  }
}
```

### Настройки прокси/балансировщика нагрузки
- **NGINX**: `proxy_read_timeout 75s;`
- **HAProxy**: `timeout client 75s; timeout server 75s;`
- **AWS ALB**: Idle timeout ≥ 60s

## 📊 Мониторинг и логирование

### Production логи (По умолчанию)
```
[MattermostTrigger] Connecting to Mattermost WebSocket... (attempt 1)
[MattermostTrigger] WebSocket connection established
[MattermostTrigger] WebSocket connection closed { code: 1006, reason: '' }
[MattermostTrigger] Scheduling reconnect in 5000ms (attempt 1)
```

### Отладочные логи
Установите `DEBUG_LOGGING = true` в коде для подробного логирования:
```
[MattermostTrigger] Sending heartbeat ping
[MattermostTrigger] Received heartbeat pong
[MattermostTrigger] Processing event: reaction_added
[MattermostTrigger] Received hello event
```

### Интеграция проверки здоровья
Мониторьте состояние соединения с помощью SQL запросов:
```sql
-- Проверьте недавние выполнения
SELECT * FROM execution_entity 
WHERE workflowId = 'ваш-workflow-id' 
AND startedAt > NOW() - INTERVAL 1 HOUR;
```

## 🎯 Поддерживаемые события

### Ресурсы
- **Team**: события управления командами
- **Channel**: операции с каналами
- **Post**: события сообщений
- **Reaction**: эмодзи реакции
- **User**: активность пользователей
- **Role**: изменения разрешений
- **Plugin**: жизненный цикл плагинов
- **Thread**: операции с ветками
- **SystemEvent**: системные уведомления

### Популярные события
- `posted` - Новые сообщения
- `reaction_added` / `reaction_removed` - Эмодзи реакции
- `user_added` / `user_removed` - Членство в канале
- `channel_created` / `channel_deleted` - Управление каналами
- `hello` - Рукопожатие WebSocket
- `ping` / `pong` - Сообщения heartbeat

## 🔍 Устранение неполадок

### Проблемы с соединением
1. **Проверьте учётные данные**: Убедитесь в правильности Base URL и токена
2. **Сетевое подключение**: Протестируйте `curl https://ваш-mattermost/api/v4/users`
3. **Правила файрвола**: Убедитесь, что трафик WebSocket разрешён
4. **Настройки прокси**: Проверьте тайм-ауты простоя и поддержку WebSocket

### Оптимизация производительности
1. **Фильтруйте события**: Выбирайте только нужные ресурсы/события
2. **Фильтрация каналов**: Используйте конкретные ID каналов когда возможно
3. **Отключите отладочное логирование**: Держите `DEBUG_LOGGING = false` в production

### Распространённые коды ошибок
- `1006`: Аномальное закрытие (проблема сети)
- `1000`: Нормальное закрытие
- `1001`: Уходит (перезапуск сервера)
- `1011`: Ошибка сервера

## 🔄 Миграция с оригинальной ноды

1. **Сделайте резервную копию воркфлоу** использующих оригинальную ноду
2. **Установите улучшенную ноду** следуя руководству по установке
3. **Обновите воркфлоу**: Замените старый триггер на новый
4. **Настройте те же учётные данные** и фильтры событий
5. **Тщательно протестируйте** перед развёртыванием в production

## 📈 История версий

**v0.2.0** - Улучшенная версия с автопереподключением
- ✅ Добавлено надёжное автопереподключение с экспоненциальным backoff
- ✅ Реализован мониторинг heartbeat (ping/pong)
- ✅ Добавлена обработка тайм-аута соединения (30с)
- ✅ Улучшена обработка ошибок и логирование
- ✅ Добавлена поддержка authentication challenge
- ✅ Улучшены опции WebSocket для стабильности
- ✅ Production-ready логирование с режимом отладки
- ✅ Правильная очистка ресурсов при завершении
- ✅ Бесконечные попытки переподключения
- ✅ Джиттер в backoff для предотвращения thundering herd

**v0.1.0** - Первоначальная версия
- Базовое WebSocket соединение
- Фильтрация событий по ресурсам/типам
- Без автопереподключения

## 🤝 Участие в разработке

1. Сделайте fork репозитория
2. Создайте ветку для новой функции
3. Добавьте тесты для новой функциональности
4. Убедитесь, что все тесты проходят
5. Отправьте pull request

## 📄 Лицензия

MIT License - см. LICENSE.md для подробностей

## 🔗 Ресурсы

- [Документация по пользовательским нодам n8n](https://docs.n8n.io/integrations/#community-nodes)
- [События WebSocket Mattermost](https://developers.mattermost.com/api-documentation/#/#websocket-events)
- [Bot аккаунты Mattermost](https://developers.mattermost.com/integrate/reference/bot-accounts/)
- [Personal Access Tokens](https://developers.mattermost.com/integrate/reference/personal-access-token/)

## 💡 Советы

- Используйте **bot токены** для production (более безопасно чем PAT)
- Мониторьте логи соединения для выявления проблем сети
- Настройте проверки здоровья для обнаружения длительных сбоев
- Рассмотрите несколько нод с разными токенами для высокой доступности
- Тестируйте переподключение временно блокируя сетевой доступ

## 🛠️ Отладка

### Включение отладочных логов
В файле `MattermostTrigger.node.ts` измените:
```typescript
const DEBUG_LOGGING = true; // Включить отладочные логи
```

### Мониторинг соединения
```bash
# Мониторинг логов в реальном времени
docker logs -f n8n-container | grep "MattermostTrigger"

# Проверка состояния соединения
docker exec n8n-container sh -c 'netstat -an | grep :443'
```