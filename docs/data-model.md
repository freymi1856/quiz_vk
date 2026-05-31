# Модель данных Quizluv

## User

Пользователь системы.

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Уникальный идентификатор |
| name | string | Имя пользователя |
| email | string | Email для входа |
| passwordHash | string | Хэш пароля |
| role | organizer / participant | Роль пользователя |
| createdAt | string | Дата регистрации |

## Quiz

Квиз, созданный организатором.

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Уникальный идентификатор |
| organizerId | string | Автор квиза |
| title | string | Название |
| description | string | Описание |
| category | string | Категория |
| timeLimitSec | number | Время на вопрос |
| rules | string | Правила проведения |
| questions | Question[] | Список вопросов |
| createdAt | string | Дата создания |
| updatedAt | string | Дата изменения |

## Question

Вопрос внутри квиза.

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Уникальный идентификатор |
| type | text / image | Тип вопроса |
| text | string | Текст вопроса |
| imageUrl | string | Ссылка на изображение |
| answerMode | single / multiple | Один или несколько правильных ответов |
| points | number | Баллы за правильный ответ |
| options | Option[] | Варианты ответа |

## Option

Вариант ответа.

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Уникальный идентификатор |
| text | string | Текст варианта |
| isCorrect | boolean | Является ли вариант правильным |

## Session

Запущенная live-комната.

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Уникальный идентификатор |
| quizId | string | Квиз, который проводится |
| organizerId | string | Организатор |
| code | string | Код комнаты |
| status | lobby / question / ended | Состояние сессии |
| currentQuestionIndex | number | Индекс текущего вопроса |
| questionStartedAt | string | Время начала текущего вопроса |
| participants | Participant[] | Участники |
| answers | Answer[] | Ответы |
| createdAt | string | Дата создания |
| startedAt | string | Дата запуска |
| endedAt | string | Дата завершения |

## Participant

Участник конкретной live-сессии.

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Уникальный идентификатор в рамках сессии |
| userId | string | Аккаунт пользователя |
| name | string | Имя в лидерборде |
| joinedAt | string | Время подключения |

## Answer

Ответ участника на вопрос.

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Уникальный идентификатор |
| sessionId | string | Сессия |
| participantId | string | Участник |
| userId | string | Пользователь |
| questionId | string | Вопрос |
| selectedOptionIds | string[] | Выбранные варианты |
| isCorrect | boolean | Правильность ответа |
| points | number | Начисленные баллы |
| answeredAt | string | Время ответа |
