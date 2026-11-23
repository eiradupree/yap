# Yap UI components

Each page covers a family: when to use each component (with Nielsen Norman
Group and PatternFly guidance), its options and controller methods, its
keyboard and screen-reader behavior, and examples. See every component live
at `/ui/gallery.html` on a running yapserver.

| Family | Components |
| --- | --- |
| [actions](actions.md) | Button, CloseButton, ButtonGroup, ToggleButton, ToggleButtonGroup, Link, Kbd |
| [display](display.md) | Avatar, AvatarGroup, Badge, Chip, Card, Surface, Separator, Spinner, Skeleton, ProgressBar, Alert, EmptyState |
| [overlays](overlays.md) | Tooltip, Popover |
| [menus](menus.md) | Dropdown (menus, sections, selection, submenus), Tabs |
| [dialogs](dialogs.md) | Modal, AlertDialog (`confirm()` / `alert()` replacements) |
| [toast](toast.md) | `YapUI.toast()` and the notification region |
| [forms](forms.md) | Label, Description, FieldError, TextField, Input, TextArea, SearchField, Checkbox, CheckboxGroup, Switch, SwitchGroup, Fieldset, Form |

How the library is built, and the rules for changing it, are in
[../CONVENTIONS.md](../CONVENTIONS.md).
