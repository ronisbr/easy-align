# Easy Align for VS Code

<p align="center">
  <img src="./images/icon.png" width="128" title="easy-align"><br>
</p>

This extension provides a way to align text in VS Code interactively.

## Features

The plugin allows you to align text by selecting the lines you want to align and calling the
`EasyAlign.alignText` function, which is mapped to the VS Code command `Align Text`. You can
provide a string or regex pattern in the input (prefix with `r/` to use regex). The
algorithm identifies the first occurrence of the pattern and aligns each line based on that
match.

You can add modifiers to the end of the input after a `/` to customize the alignment
behavior. The available modifiers are:

- `/g`: Align all occurrences of the pattern in each line.
- `/g<i>`: Align the first `<i>` occurrences of the pattern, where `<i>` must be an integer
  number.
- `/n`: Align the character immediately following the pattern in each line.
- `/r`: Align the text to the right.

The alignment is interactive, allowing you to preview the result before accepting it. Press
`Esc` to discard changes.

## Examples

If the following lines are selected when calling `EasyAlign.alignText`:

```julia
this_is_one_variable = 1
this_is_another = 2
one_more = 3
```

and the input is `=`, the result will be:

```julia
this_is_one_variable = 1
this_is_another      = 2
one_more             = 3
```

Now, consider the following case where we want to align all the parameters:

```julia
myfunc(first_p, second_p, thrid_p)
myfunc(another_first_p, another_second_p, another_third_p)
```

You can use `,/gn` to achieve:

```julia
myfunc(first_p,         second_p,         thrid_p)
myfunc(another_first_p, another_second_p, another_third_p)
```