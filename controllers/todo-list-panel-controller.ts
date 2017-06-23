import { v4 as uuid } from "uuid";
import { todoIdDataAttrName } from "../app.common";
import { Dependencies } from "../dependencies";
import { TodoList } from "../domain/todo-list";
import { AggregateIdType, DomainEvent, domainEventsByAggregate, postDomainEvents } from "../event-store";
import { fillControllerElements, findElement, getRequiredAttribute, templateClone } from "../utils";

export function todoListPanelController(di: Dependencies, events: DomainEvent[]): DocumentFragment {
    let fragment = templateClone("todoListPanelTemplate");
    let todoList = new TodoList(events);
    let todoListId = todoList.id;
    let $todoListDelegatedEventTarget = $(findElement(fragment, "#todolistDelegatedEventTarget"));
    // Need to handle keypress here because the completeTodoBtn is an <a> without an href,
    // so tabbing to it and pressing enter doesn't trigger a click event like it would with a <button>.
    // I want completeTodoBtn to act like a <button>, but it has another <button> inside of it (todoActionsBtn),
    // so browsers and Bootstrap styling wouldn't work if it was a <button> (HTML spec says no interactive content
    // inside interactive content). By using an <a> with no href I get the a.list-group-item Bootstrap styling.
    $todoListDelegatedEventTarget.on("click keypress", ".completeTodoBtn", e => {
        completeTodoBtnHandler(e, true);
    });
    $todoListDelegatedEventTarget.on("click keypress", ".uncompleteTodoBtn", e => {
        completeTodoBtnHandler(e, false);
    });
    function completeTodoBtnHandler(e: JQueryEventObject, isComplete: boolean): void {
        // only handle "enter" keypresses
        if (e.type === "keypress" && e.which !== 13) {
            return;
        }
        // short-circuit if this event has bubbled up from the todoActionsBtn (which is inside (un)complete todo buttons)
        let todoActionsBtn = $(e.currentTarget).find(".todoActionsBtn")[0];
        if (todoActionsBtn === e.target || $.contains(todoActionsBtn, e.target)) {
            return;
        }
        commander(e, (list, id) => {
            if (isComplete) {
                list.complete(id, Date.now());
            } else {
                list.uncomplete(id);
            }
        }).catch(console.log);
    }
    $todoListDelegatedEventTarget.on("click", ".moveTodoUpBtn", e => {
        commander(e, (list, id) => {
            list.changePosition(id, -1);
        }).catch(console.log);
    });
    $todoListDelegatedEventTarget.on("click", ".moveTodoDownBtn", e => {
        commander(e, (list, id) => {
            list.changePosition(id, 1);
        }).catch(console.log);
    });
    $todoListDelegatedEventTarget.on("click", ".deleteTodoBtn", e => {
        commander(e, (list, id) => {
            list.remove(id);
        }).catch(console.log);
    });
    $todoListDelegatedEventTarget.on("submit", ".renameTodoForm", e => {
        e.preventDefault();
        let todoName = $(e.currentTarget).find("input[name='name']").val() as string;
        commander(e, (list, id) => {
            list.rename(id, todoName);
        }).catch(console.log);
    });
    async function commander(e: JQueryEventObject, command: (todoList: TodoList, todoId: string) => void): Promise<void> {
        let refreshEvents = await domainEventsByAggregate(todoListId);
        let refreshTodoList = new TodoList(refreshEvents);
        let todoId = getRequiredAttribute(e.currentTarget, todoIdDataAttrName);
        command(refreshTodoList, todoId);
        await postDomainEvents(refreshTodoList.uncommittedEvents);
        await di.refreshLists(di, todoListId);
    }
    $todoListDelegatedEventTarget.on("click", ".todoActionsBtn", e => {
        let $defaultPanel = $(e.currentTarget).closest(".todoPanelDefault");
        let $actionsPanel = $defaultPanel.next();
        let $bothPanels = $defaultPanel.add($actionsPanel);
        let actionsBtnGroup = $actionsPanel.find(".todoActionsPanelBtnGroup")[0];
        let eventNamespace = "click.todoActionsPanelClose:" + uuid();
        $bothPanels.toggle();
        // This handler will close (i.e. toggle) the ActionsPanel when the user clicks anywhere in the document outside of the actionsBtnGroup.
        // eventNamespace is unique (probably) so each instance of this handler can only detach itself.
        $(document).on(eventNamespace, closeEvent => {
            // Short-circuit when handler is triggered by event that created it.
            // This happens because this handler is created in the todolistDelegatedEventTarget handler but attached to the document.
            // So, when the todolistDelegatedEventTarget handler returns, the click event that triggered it will still bubble to the document.
            if (e.originalEvent === closeEvent.originalEvent) {
                return;
            }
            if (!$.contains(actionsBtnGroup, closeEvent.target)) {
                $bothPanels.toggle();
            }
            $(document).off(eventNamespace);
        });
    });
    $todoListDelegatedEventTarget.on("click", ".renameTodoBtn", e => {
        let $actionsPanel = $(e.currentTarget).closest(".todoActionsPanel");
        let $renamePanel = $actionsPanel.next();
        $actionsPanel.add($renamePanel).toggle();
        $renamePanel.find(".renameTodoBtnClickFocusTarget").first().focus();
    });
    $todoListDelegatedEventTarget.on("blur", ".renameTodoForm", e => {
        if (!(e.relatedTarget && $.contains(e.currentTarget, e.relatedTarget))) {
            let $renamePanel = $(e.currentTarget).closest(".todoRenamePanel");
            $renamePanel.prev().prev().add($renamePanel).toggle();
        }
    });
    fillControllerElements(fragment, "addTodoFormController", di.addTodoFormController(di, todoListId));
    fillControllerElements(fragment, "incompleteTodoListController", di.incompleteTodoListController(di, todoList.todos));
    fillControllerElements(fragment, "completedTodoListController", di.completedTodoListController(di, todoList.completedTodos));
    return fragment;
}
